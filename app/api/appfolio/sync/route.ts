import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchVendorLedger, parseCostCategory, type VendorLedgerRow } from "@/lib/appfolio";

/**
 * POST /api/appfolio/sync
 *
 * Admin-only endpoint that:
 * 1. Creates an appfolio_syncs record
 * 2. Fetches vendor_ledger from AppFolio for all projects with appfolio_property_id
 *    (vendor_ledger includes the Project Cost Category field used for matching)
 * 3. Upserts into appfolio_transactions (keyed by appfolio_bill_id)
 * 4. Returns sync stats
 */
export async function POST(request: Request) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Parse optional body params
    let fromDate: string;
    let toDate: string;
    let propertyId: string | null = null;
    let adminOnly = false;
    try {
      const body = await request.json();
      fromDate = body.fromDate ?? getDefaultFromDate();
      toDate = body.toDate ?? getDefaultToDate();
      propertyId = body.propertyId ?? null;
      adminOnly = !propertyId; // full sync (no propertyId) requires admin
    } catch {
      fromDate = getDefaultFromDate();
      toDate = getDefaultToDate();
      adminOnly = true;
    }

    if (adminOnly) {
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (user?.role !== "admin") {
        return NextResponse.json({ error: "Admin role required for full sync" }, { status: 403 });
      }
    }

    // Create sync record
    const { data: syncRecord, error: syncErr } = await supabase
      .from("appfolio_syncs")
      .insert({
        triggered_by: userId,
        sync_type: "manual",
        status: "running",
      })
      .select("id")
      .single();
    if (syncErr || !syncRecord) {
      throw new Error(`Failed to create sync record: ${syncErr?.message}`);
    }
    const syncId = syncRecord.id;

    try {
      // Get projects with appfolio_property_id set (optionally filtered to one property)
      let projectQuery = supabase
        .from("projects")
        .select("id, name, appfolio_property_id")
        .not("appfolio_property_id", "is", null)
        .neq("appfolio_property_id", "");
      if (propertyId) {
        projectQuery = projectQuery.eq("appfolio_property_id", propertyId);
      }
      const { data: projects } = await projectQuery;

      if (!projects || projects.length === 0) {
        await supabase
          .from("appfolio_syncs")
          .update({
            status: "completed",
            records_fetched: 0,
            records_upserted: 0,
            records_unmapped: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncId);

        return NextResponse.json({
          syncId,
          status: "completed",
          message: "No projects with AppFolio Property ID configured",
          records_fetched: 0,
          records_upserted: 0,
        });
      }

      // Collect all unique property IDs
      const propertyIds = [
        ...new Set(
          projects
            .map((p: { appfolio_property_id: string | null }) => p.appfolio_property_id)
            .filter(Boolean) as string[]
        ),
      ];

      // Fetch vendor ledger from AppFolio (contains Project Cost Category)
      const rows = await fetchVendorLedger({
        propertyIds,
        fromDate,
        toDate,
        paymentStatus: "All",
      });

      // Upsert transactions
      let upsertedCount = 0;
      let unmappedCount = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const upsertRows = batch.map((row: VendorLedgerRow) => {
          const paidAmt = parseFloat(row.paid ?? "0") || 0;
          const unpaidAmt = parseFloat(row.unpaid ?? "0") || 0;
          const { code: costCode, name: costName } = parseCostCategory(row.project_cost_category);
          if (!costCode) unmappedCount++;
          return {
            appfolio_bill_id: String(row.payable_invoice_detail_id),
            appfolio_property_id: String(row.property_id ?? ""),
            vendor_name: row.payee_name ?? "Unknown",
            gl_account_id: row.account_number ?? "",
            gl_account_name: row.account_name ?? "",
            cost_category_code: costCode ?? null,
            cost_category_name: costName ?? null,
            bill_date: row.bill_date ?? null,
            due_date: row.due_date ?? null,
            payment_date: row.payment_date ?? null,
            invoice_amount: paidAmt + unpaidAmt,
            paid_amount: paidAmt,
            unpaid_amount: unpaidAmt,
            payment_type: null,
            check_number: row.check_number ?? null,
            payment_status: unpaidAmt === 0 ? "Paid" : paidAmt === 0 ? "Unpaid" : "Partial",
            reference_number: null,
            description: row.description ?? null,
            property_name: row.property_name ?? null,
            sync_id: syncId,
          };
        });

        const { error: upsertErr } = await supabase
          .from("appfolio_transactions")
          .upsert(upsertRows, { onConflict: "appfolio_bill_id" });

        if (upsertErr) {
          console.error("[sync] Upsert batch error:", upsertErr.message);
        } else {
          upsertedCount += upsertRows.length;
        }
      }

      // Mark sync complete
      await supabase
        .from("appfolio_syncs")
        .update({
          status: "completed",
          records_fetched: rows.length,
          records_upserted: upsertedCount,
          records_unmapped: unmappedCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      return NextResponse.json({
        syncId,
        status: "completed",
        records_fetched: rows.length,
        records_upserted: upsertedCount,
        records_unmapped: unmappedCount,
        projects_synced: projects.length,
        date_range: { fromDate, toDate },
      });
    } catch (err) {
      await supabase
        .from("appfolio_syncs")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      throw err;
    }
  } catch (err) {
    console.error("[appfolio/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

/* ─── Helpers ──────────────────────────────────────────── */

function getDefaultFromDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split("T")[0];
}

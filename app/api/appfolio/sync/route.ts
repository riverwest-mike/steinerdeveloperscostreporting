import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchBillDetail, type BillDetailRow } from "@/lib/appfolio";

/**
 * POST /api/appfolio/sync
 *
 * Admin-only endpoint that:
 * 1. Creates an appfolio_syncs record
 * 2. Fetches bill_detail from AppFolio for all projects with appfolio_property_id
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

    // Verify admin role
    const { data: user } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    if (user?.role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    // Parse optional body params
    let fromDate: string;
    let toDate: string;
    try {
      const body = await request.json();
      fromDate = body.fromDate ?? getDefaultFromDate();
      toDate = body.toDate ?? getDefaultToDate();
    } catch {
      fromDate = getDefaultFromDate();
      toDate = getDefaultToDate();
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
      // Get all projects with appfolio_property_id set
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, appfolio_property_id")
        .not("appfolio_property_id", "is", null)
        .neq("appfolio_property_id", "");

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

      // Fetch bill detail from AppFolio
      const bills = await fetchBillDetail({
        propertyIds,
        fromDate,
        toDate,
        paymentStatus: "All",
      });

      // Build property-to-project lookup
      const propertyToProject = new Map<string, string>();
      for (const p of projects) {
        if (p.appfolio_property_id) {
          propertyToProject.set(p.appfolio_property_id, p.id);
        }
      }

      // Upsert transactions into appfolio_transactions
      let upsertedCount = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < bills.length; i += BATCH_SIZE) {
        const batch = bills.slice(i, i + BATCH_SIZE);
        const rows = batch.map((bill: BillDetailRow) => {
          const paidAmt = parseFloat(bill.paid ?? "0") || 0;
          const unpaidAmt = parseFloat(bill.unpaid ?? "0") || 0;
          return {
            appfolio_bill_id: String(bill.payable_invoice_detail_id),
            appfolio_property_id: String(bill.property_id ?? ""),
            vendor_name: bill.payee_name ?? "Unknown",
            gl_account_id: bill.account_number ?? "",
            gl_account_name: bill.account_name ?? "",
            bill_date: bill.bill_date ?? null,
            due_date: bill.due_date ?? null,
            payment_date: bill.payment_date ?? null,
            invoice_amount: paidAmt + unpaidAmt,
            paid_amount: paidAmt,
            unpaid_amount: unpaidAmt,
            payment_type: bill.other_payment_type ?? null,
            check_number: bill.check_number ?? null,
            payment_status: unpaidAmt === 0 ? "Paid" : paidAmt === 0 ? "Unpaid" : "Partial",
            reference_number: bill.reference_number ?? null,
            description: bill.description ?? null,
            property_name: bill.property_name ?? null,
            sync_id: syncId,
          };
        });

        const { error: upsertErr } = await supabase
          .from("appfolio_transactions")
          .upsert(rows, { onConflict: "appfolio_bill_id" });

        if (upsertErr) {
          console.error("[sync] Upsert batch error:", upsertErr.message);
        } else {
          upsertedCount += rows.length;
        }
      }

      // Mark sync complete
      await supabase
        .from("appfolio_syncs")
        .update({
          status: "completed",
          records_fetched: bills.length,
          records_upserted: upsertedCount,
          records_unmapped: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      return NextResponse.json({
        syncId,
        status: "completed",
        records_fetched: bills.length,
        records_upserted: upsertedCount,
        projects_synced: projects.length,
        date_range: { fromDate, toDate },
      });
    } catch (err) {
      // Mark sync failed
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
  // Default: 12 months ago
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split("T")[0];
}

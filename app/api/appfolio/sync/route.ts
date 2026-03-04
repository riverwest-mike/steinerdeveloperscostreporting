import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchVendorLedger, parseCostCategory, getProjectCostCategory, type VendorLedgerRow } from "@/lib/appfolio";

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

      // ── Upsert transactions ───────────────────────────────────────────────
      let upsertedCount = 0;
      let unmappedCount = 0;
      const BATCH_SIZE = 100;

      // Log the actual field keys from the first row so we can confirm the
      // AppFolio cost-category field name in the server logs.
      if (rows.length > 0) {
        const sampleKeys = Object.keys(rows[0] as object);
        console.log("[sync] AppFolio vendor_ledger first-row keys:", sampleKeys.join(", "));
        const costCatRaw = getProjectCostCategory(rows[0] as VendorLedgerRow);
        console.log("[sync] project_cost_category sample value:", costCatRaw);
      }

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        // Build rows using AppFolio's Project Cost Code as the source of truth.
        // For rows where AppFolio returns no cost code, we look up and preserve
        // the existing DB value so a re-sync never wipes a valid classification.
        const prelimRows = batch.map((row: VendorLedgerRow) => {
          const paidAmt = parseFloat(row.paid ?? "0") || 0;
          const unpaidAmt = parseFloat(row.unpaid ?? "0") || 0;

          // 1st choice: AppFolio Project Cost Category (only set when bill is linked
          //             to an AppFolio Project with a cost category assigned).
          // 2nd choice: GL account_number + account_name — AppFolio invoices coded
          //             directly to a GL account (e.g. "010700" / "Survey") with no
          //             Project attached still carry the cost code in these fields.
          let costCatRaw = getProjectCostCategory(row);
          if (!costCatRaw) {
            const acctNum = (row.account_number ?? "").trim();
            const acctName = (row.account_name ?? "").trim();
            if (acctNum && /^\d/.test(acctNum)) {
              costCatRaw = acctName ? `${acctNum} ${acctName}` : acctNum;
            }
          }
          const { code: costCode, name: costName } = parseCostCategory(costCatRaw);
          return {
            appfolio_bill_id: String(row.payable_invoice_detail_id),
            appfolio_property_id: String(row.property_id ?? ""),
            vendor_name: row.payee_name ?? "Unknown",
            gl_account_id: row.account_number ?? "",
            gl_account_name: row.account_name ?? "",
            _appfolio_code: costCode ?? null,
            _appfolio_name: costName ?? null,
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

        // For rows AppFolio returned no cost code for, fetch the existing DB
        // value so we can preserve it instead of overwriting with null.
        const needsLookup = prelimRows
          .filter((r) => !r._appfolio_code)
          .map((r) => r.appfolio_bill_id);

        const existingMap = new Map<string, { cost_category_code: string | null; cost_category_name: string | null }>();
        if (needsLookup.length > 0) {
          const { data: existing } = await supabase
            .from("appfolio_transactions")
            .select("appfolio_bill_id, cost_category_code, cost_category_name")
            .in("appfolio_bill_id", needsLookup);
          for (const e of (existing ?? []) as { appfolio_bill_id: string; cost_category_code: string | null; cost_category_name: string | null }[]) {
            existingMap.set(e.appfolio_bill_id, e);
          }
        }

        // Final pass: use AppFolio code if present, else fall back to existing DB value.
        const upsertRows = prelimRows.map((row) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _appfolio_code, _appfolio_name, ...rest } = row;

          let finalCode = _appfolio_code;
          let finalName = _appfolio_name;

          if (!finalCode) {
            const prev = existingMap.get(row.appfolio_bill_id);
            if (prev?.cost_category_code) {
              finalCode = prev.cost_category_code;
              finalName = prev.cost_category_name ?? null;
            }
          }

          if (!finalCode) unmappedCount++;

          return {
            ...rest,
            cost_category_code: finalCode ?? null,
            cost_category_name: finalName ?? null,
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

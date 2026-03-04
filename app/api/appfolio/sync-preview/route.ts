import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchVendorLedger, parseCostCategory, getProjectCostCategory, type VendorLedgerRow } from "@/lib/appfolio";

/**
 * GET /api/appfolio/sync-preview?property_id=196
 *
 * 1. Fetches from AppFolio using the exact same call the real sync uses
 * 2. Queries the DB for those same bill IDs to show current stored state
 * 3. Returns side-by-side comparison so we can see if upsert is failing
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const supabase = createAdminClient();
    const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
    if (user?.role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("property_id");
    if (!propertyId) {
      return NextResponse.json({ error: "property_id param required" }, { status: 400 });
    }

    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = searchParams.get("from_date") ?? new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // ── 1. Fetch from AppFolio (same as real sync) ─────────────────────────
    const rows = await fetchVendorLedger({
      propertyIds: [propertyId],
      fromDate,
      toDate,
      paymentStatus: "All",
    });

    const billIds = rows.map((row: VendorLedgerRow) => String(row.payable_invoice_detail_id));

    const preview = rows.map((row: VendorLedgerRow) => {
      const rawCostCat = getProjectCostCategory(row);
      const { code, name } = parseCostCategory(rawCostCat);
      return {
        appfolio_bill_id: String(row.payable_invoice_detail_id),
        payee_name: row.payee_name,
        bill_date: row.bill_date,
        invoice_amount: (parseFloat(row.paid ?? "0") || 0) + (parseFloat(row.unpaid ?? "0") || 0),
        raw_project_cost_category: rawCostCat,
        would_store_cost_category_code: code,
        would_store_cost_category_name: name,
      };
    });

    // ── 2. Query DB for current stored state of these bill IDs ────────────
    const { data: dbRows, error: dbErr } = await supabase
      .from("appfolio_transactions")
      .select("appfolio_bill_id, appfolio_property_id, cost_category_code, cost_category_name, vendor_name, invoice_amount, bill_date")
      .in("appfolio_bill_id", billIds.length > 0 ? billIds : ["__none__"]);

    // Also query by property_id to catch any rows that exist but with different bill_id format
    const { data: dbByProperty } = await supabase
      .from("appfolio_transactions")
      .select("appfolio_bill_id, appfolio_property_id, cost_category_code, cost_category_name, vendor_name, invoice_amount, bill_date")
      .eq("appfolio_property_id", propertyId);

    // Build a map for easy lookup
    interface DbTx { appfolio_bill_id: string; appfolio_property_id: string; cost_category_code: string | null; cost_category_name: string | null; vendor_name: string | null; invoice_amount: number | null; bill_date: string | null; }
    const typedDbRows = (dbRows ?? []) as DbTx[];
    const dbMap = new Map(typedDbRows.map((r) => [r.appfolio_bill_id, r]));

    // ── 3. Side-by-side comparison ────────────────────────────────────────
    const comparison = preview.map((p) => {
      const db = dbMap.get(p.appfolio_bill_id);
      return {
        appfolio_bill_id: p.appfolio_bill_id,
        payee_name: p.payee_name,
        bill_date: p.bill_date,
        invoice_amount: p.invoice_amount,
        appfolio_code: p.would_store_cost_category_code,
        appfolio_name: p.would_store_cost_category_name,
        db_exists: !!db,
        db_property_id: db?.appfolio_property_id ?? null,
        db_code: db?.cost_category_code ?? null,
        db_name: db?.cost_category_name ?? null,
        match: p.would_store_cost_category_code === (db?.cost_category_code ?? null),
      };
    });

    const withCode = preview.filter((r) => r.would_store_cost_category_code !== null);
    const withoutCode = preview.filter((r) => r.would_store_cost_category_code === null);
    const dbHasCorrect = comparison.filter((r) => r.db_code !== null && r.db_code === r.appfolio_code).length;
    const dbHasNull = comparison.filter((r) => r.db_exists && r.db_code === null).length;
    const dbMissing = comparison.filter((r) => !r.db_exists).length;

    return NextResponse.json({
      property_id: propertyId,
      date_range: { fromDate, toDate },
      // AppFolio fetch results
      total_rows: rows.length,
      rows_with_cost_category: withCode.length,
      rows_without_cost_category: withoutCode.length,
      // DB state
      db_error: dbErr?.message ?? null,
      db_rows_total_for_property: (dbByProperty ?? []).length,
      db_rows_with_correct_code: dbHasCorrect,
      db_rows_with_null_code: dbHasNull,
      db_rows_missing: dbMissing,
      // Full comparison
      comparison: comparison.slice(0, 50),
      // All DB rows for this property (shows bill_id format and property_id)
      all_db_rows_for_property: (dbByProperty ?? []).slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 }
    );
  }
}

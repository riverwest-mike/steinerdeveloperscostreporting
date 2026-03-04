import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchVendorLedger, parseCostCategory, getProjectCostCategory, type VendorLedgerRow } from "@/lib/appfolio";

/**
 * GET /api/appfolio/sync-preview?property_id=196
 *
 * Runs the EXACT same AppFolio fetch the real sync uses (same function,
 * same parameters, same property filter) but does NOT write to the DB.
 * Returns what cost_category_code/name would be stored for each row.
 *
 * Use this to diagnose why project_cost_category is not being captured.
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
    const fromDate = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // Use EXACTLY the same fetchVendorLedger call as the real sync
    const rows = await fetchVendorLedger({
      propertyIds: [propertyId],
      fromDate,
      toDate,
      paymentStatus: "All",
    });

    const preview = rows.map((row: VendorLedgerRow) => {
      const rawCostCat = getProjectCostCategory(row);
      const { code, name } = parseCostCategory(rawCostCat);
      return {
        appfolio_bill_id: String(row.payable_invoice_detail_id),
        payee_name: row.payee_name,
        bill_date: row.bill_date,
        invoice_amount: (parseFloat(row.paid ?? "0") || 0) + (parseFloat(row.unpaid ?? "0") || 0),
        // Raw value from AppFolio before parsing
        raw_project_cost_category: rawCostCat,
        // Parsed values that would be stored
        would_store_cost_category_code: code,
        would_store_cost_category_name: name,
        // Show all keys so we can spot field name variants
        all_keys: Object.keys(row as object),
      };
    });

    const withCode = preview.filter((r) => r.would_store_cost_category_code !== null);
    const withoutCode = preview.filter((r) => r.would_store_cost_category_code === null);

    return NextResponse.json({
      property_id: propertyId,
      date_range: { fromDate, toDate },
      total_rows: rows.length,
      rows_with_cost_category: withCode.length,
      rows_without_cost_category: withoutCode.length,
      // Show all rows (capped at 50 for readability)
      preview: preview.slice(0, 50),
      // Highlight rows that would have no cost category
      sample_without_code: withoutCode.slice(0, 5),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 }
    );
  }
}

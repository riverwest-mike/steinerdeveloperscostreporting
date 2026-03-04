import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/debug/report-query?property_id=196&as_of=2026-03-04
 *
 * Runs the EXACT same Supabase query the report page uses to fetch
 * appfolio_transactions, and also runs the cost_categories lookup,
 * then shows the full matching result.
 *
 * Use to diagnose why the report shows "(no cost category)" even though
 * the DB has correct cost_category_code values.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = createAdminClient();
    const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
    if ((user as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("property_id");
    const asOf = searchParams.get("as_of") ?? new Date().toISOString().split("T")[0];

    if (!propertyId) return NextResponse.json({ error: "property_id param required" }, { status: 400 });

    // ── 1. Exact report transaction query ──────────────────────────────────
    const { data: rawTx, error: txError } = await supabase
      .from("appfolio_transactions")
      .select("cost_category_code, cost_category_name, vendor_name, invoice_amount")
      .eq("appfolio_property_id", propertyId)
      .or(`bill_date.lte.${asOf},bill_date.is.null`);

    // ── 2. Also fetch with SELECT * to see all columns ─────────────────────
    const { data: rawTxFull, error: txFullError } = await supabase
      .from("appfolio_transactions")
      .select("*")
      .eq("appfolio_property_id", propertyId)
      .or(`bill_date.lte.${asOf},bill_date.is.null`);

    // ── 3. Load cost categories (same as report) ───────────────────────────
    const { data: rawCategories } = await supabase
      .from("cost_categories")
      .select("id, name, code, description, display_order")
      .eq("is_active", true)
      .order("display_order");

    const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

    // ── 4. Run the matching logic (exact copy from report page) ────────────
    const codeToCategory = new Map<string, string>();
    for (const cat of categories) {
      const full = cat.code.trim().toUpperCase();
      codeToCategory.set(full, cat.id);
      const spaceIdx = full.indexOf(" ");
      if (spaceIdx > 0) {
        const prefix = full.slice(0, spaceIdx);
        if (!codeToCategory.has(prefix)) codeToCategory.set(prefix, cat.id);
      }
    }

    type TxRow = { cost_category_code: string | null; cost_category_name: string | null; vendor_name: string; invoice_amount: number };
    const txRows = (rawTx ?? []) as TxRow[];

    const matchResults = txRows.map((tx) => {
      const code = (tx.cost_category_code ?? "").trim().toUpperCase();
      const catId = code ? (codeToCategory.get(code) ?? null) : null;
      const matchedCat = catId ? categories.find((c) => c.id === catId) : null;
      return {
        vendor_name: tx.vendor_name,
        invoice_amount: tx.invoice_amount,
        raw_cost_category_code: tx.cost_category_code,
        uppercased_code: code,
        catId_found: catId,
        matched_category_name: matchedCat?.name ?? null,
        matched_category_code: matchedCat?.code ?? null,
        result: catId ? "MATCHED" : (code ? `UNMATCHED (code="${code}" not in map)` : "NO CODE"),
      };
    });

    return NextResponse.json({
      query_params: { propertyId, asOf },
      // Transaction query result
      tx_query_error: txError?.message ?? null,
      tx_count: txRows.length,
      // The raw rows as returned by the exact report query
      tx_raw_rows: txRows,
      // Full rows (SELECT *) to confirm DB values
      tx_full_rows_cost_code: (rawTxFull ?? []).map((r: Record<string, unknown>) => ({
        appfolio_bill_id: r.appfolio_bill_id,
        cost_category_code: r.cost_category_code,
        vendor_name: r.vendor_name,
      })),
      tx_full_query_error: txFullError?.message ?? null,
      // Matching results
      categories_count: categories.length,
      code_map_entries: [...codeToCategory.entries()].map(([k, v]) => ({
        key: k,
        category: categories.find((c) => c.id === v)?.name,
      })),
      match_results: matchResults,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

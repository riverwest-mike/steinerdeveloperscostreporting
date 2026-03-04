import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/appfolio/test
 *
 * Admin-only endpoint that makes a small test call to AppFolio vendor_ledger
 * and returns the raw field names + first few records so we can see
 * exactly what columns are available, including the cost_category field.
 */
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    if (user?.role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const clientId = process.env.APPFOLIO_CLIENT_ID!;
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET!;
    const dbUrl = process.env.APPFOLIO_DATABASE_URL!;

    // Accept ?property_id=196&days=365 query params
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("property_id");
    const days = parseInt(searchParams.get("days") ?? "90", 10);

    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const params: Record<string, unknown> = {
      occurred_on_from: fromDate,
      occurred_on_to: toDate,
      paginate_results: true,
    };

    if (propertyId) {
      params.properties = { properties_ids: [propertyId] };
    }

    // Try vendor_ledger first (has cost_category), fall back to bill_detail
    const endpoints = ["vendor_ledger", "bill_detail"];
    const results: Record<string, unknown> = {};

    for (const endpoint of endpoints) {
      const url = `https://${dbUrl}/api/v2/reports/${endpoint}.json`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(params),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        results[endpoint] = { error: `${res.status}`, body: text };
        continue;
      }

      const data = await res.json();
      const rows = data.results ?? [];

      const allFields = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          allFields.add(key);
        }
      }

      const withCostCategory = rows.filter(
        (r: Record<string, unknown>) => r.project_cost_category != null && r.project_cost_category !== ""
      );
      results[endpoint] = {
        total_records: rows.length,
        has_next_page: !!data.next_page_url,
        all_field_names: [...allFields].sort(),
        records_with_project_cost_category: withCostCategory.length,
        sample_with_cost_category: withCostCategory.slice(0, 3),
        sample_without_cost_category: rows.filter(
          (r: Record<string, unknown>) => !r.project_cost_category
        ).slice(0, 2),
      };
    }

    return NextResponse.json({
      date_range: { fromDate, toDate },
      filter: propertyId ? { property_id: propertyId } : "all properties",
      endpoints: results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}

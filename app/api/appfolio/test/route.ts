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
export async function GET() {
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

    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const params = {
      occurred_on_from: fromDate,
      occurred_on_to: toDate,
      paginate_results: true,
    };

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

      results[endpoint] = {
        total_records: rows.length,
        has_next_page: !!data.next_page_url,
        all_field_names: [...allFields].sort(),
        sample_records: rows.slice(0, 3),
        has_cost_category: allFields.has("cost_category"),
      };
    }

    return NextResponse.json({ date_range: { fromDate, toDate }, endpoints: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}

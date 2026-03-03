import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/appfolio/test
 *
 * Admin-only endpoint that makes a small test call to AppFolio bill_detail
 * and returns the raw field names + first few records so we can see
 * exactly what columns are available.
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

    // Fetch just a small window of bills to inspect the schema
    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    const url = `https://${dbUrl}/api/v2/reports/bill_detail.json`;
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        occurred_on_from: fromDate,
        occurred_on_to: toDate,
        paginate_results: true,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        error: `AppFolio API ${res.status}`,
        body: text,
      }, { status: 502 });
    }

    const data = await res.json();
    const results = data.results ?? [];

    // Extract all unique field names across all records
    const allFields = new Set<string>();
    for (const row of results) {
      for (const key of Object.keys(row)) {
        allFields.add(key);
      }
    }

    return NextResponse.json({
      total_records: results.length,
      has_next_page: !!data.next_page_url,
      all_field_names: [...allFields].sort(),
      sample_records: results.slice(0, 3),
      date_range: { fromDate, toDate },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/appfolio/properties
 *
 * Admin-only endpoint that returns all unique properties seen in AppFolio
 * bill_detail over the past 2 years, sorted by name.
 * Useful for finding the property_id values to set on projects.
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

    if (!clientId || !clientSecret || !dbUrl) {
      return NextResponse.json({ error: "Missing AppFolio environment variables" }, { status: 500 });
    }

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - 2 * 365 * 86400000).toISOString().split("T")[0];

    const headers = { "Content-Type": "application/json", Authorization: authHeader };

    // First page — POST with date range params
    const firstRes = await fetch(
      `https://${dbUrl}/api/v2/reports/bill_detail.json`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ occurred_on_from: fromDate, occurred_on_to: toDate, paginate_results: true }),
        cache: "no-store",
      }
    );
    if (!firstRes.ok) {
      const text = await firstRes.text();
      return NextResponse.json({ error: `AppFolio API ${firstRes.status}`, body: text }, { status: 502 });
    }
    const firstData = await firstRes.json();

    // Collect unique properties across all pages
    const seen = new Map<number, { id: number; name: string; address: string }>();

    const collectRows = (results: Record<string, unknown>[]) => {
      for (const row of results) {
        const pid = row.property_id as number | null;
        if (pid != null && !seen.has(pid)) {
          seen.set(pid, {
            id: pid,
            name: (row.property_name as string) ?? "",
            address: (row.property_address as string) ?? "",
          });
        }
      }
    };

    collectRows(firstData.results ?? []);
    let nextUrl: string | null = firstData.next_page_url ?? null;

    // Follow pagination — POST with no body
    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        method: "POST",
        headers,
        cache: "no-store",
      });
      if (!res.ok) break;
      const data = await res.json();
      collectRows(data.results ?? []);
      nextUrl = data.next_page_url ?? null;
    }

    const properties = [...seen.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ properties, total: properties.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

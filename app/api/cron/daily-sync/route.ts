import { NextResponse } from "next/server";
import { runAppfolioSync } from "@/lib/appfolio-sync-core";

/**
 * GET /api/cron/daily-sync
 *
 * Called by Vercel Cron daily. Authenticated via CRON_SECRET env var —
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 *
 * Syncs vendor ledger data for all linked AppFolio properties and records
 * the run as sync_type = "scheduled" with triggered_by = null.
 *
 * To test locally:
 *   curl -X GET http://localhost:3000/api/cron/daily-sync \
 *     -H "Authorization: Bearer <your CRON_SECRET>"
 */
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (or an authorised caller)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/daily-sync] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron/daily-sync] Starting scheduled AppFolio sync");

    const result = await runAppfolioSync({
      syncType: "scheduled",
      triggeredBy: null,
    });

    console.log(
      `[cron/daily-sync] Completed — fetched: ${result.records_fetched}, ` +
      `upserted: ${result.records_upserted}, unmapped: ${result.records_unmapped}, ` +
      `projects: ${result.projects_synced}`
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/daily-sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

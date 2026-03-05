import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runAppfolioSync, getDefaultFromDate, getDefaultToDate } from "@/lib/appfolio-sync-core";

/**
 * POST /api/appfolio/sync
 *
 * Admin-only endpoint that syncs AppFolio vendor ledger data.
 * Full syncs (no propertyId) require admin role.
 * Single-property syncs are available to any authenticated user.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let fromDate = getDefaultFromDate();
    let toDate = getDefaultToDate();
    let propertyId: string | null = null;
    let adminOnly = false;

    try {
      const body = await request.json();
      fromDate = body.fromDate ?? fromDate;
      toDate = body.toDate ?? toDate;
      propertyId = body.propertyId ?? null;
      adminOnly = !propertyId;
    } catch {
      adminOnly = true;
    }

    if (adminOnly) {
      const supabase = createAdminClient();
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (user?.role !== "admin") {
        return NextResponse.json({ error: "Admin role required for full sync" }, { status: 403 });
      }
    }

    const result = await runAppfolioSync({
      syncType: "manual",
      triggeredBy: userId,
      propertyId,
      fromDate,
      toDate,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[appfolio/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

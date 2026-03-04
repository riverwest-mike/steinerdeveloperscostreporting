import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchBalanceSheet } from "@/lib/appfolio";

/**
 * POST /api/appfolio/sync-balance-sheet
 *
 * Admin-only endpoint that:
 * 1. Creates an appfolio_syncs record
 * 2. Fetches the balance sheet from AppFolio for all projects with appfolio_property_id
 *    for the given asOfDate and accountingBasis (defaults: today, Accrual)
 * 3. Upserts into gl_balances (keyed by property_id + account_id + as_of_date + basis)
 * 4. Returns sync stats
 */
export async function POST(request: Request) {
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

    // Parse body params
    let asOfDate: string;
    let accountingBasis: "Cash" | "Accrual";
    try {
      const body = await request.json();
      asOfDate = body.asOfDate ?? new Date().toISOString().split("T")[0];
      accountingBasis = body.accountingBasis === "Cash" ? "Cash" : "Accrual";
    } catch {
      asOfDate = new Date().toISOString().split("T")[0];
      accountingBasis = "Accrual";
    }

    // Create sync record
    const { data: syncRecord, error: syncErr } = await supabase
      .from("appfolio_syncs")
      .insert({ triggered_by: userId, sync_type: "manual", status: "running" })
      .select("id")
      .single();
    if (syncErr || !syncRecord) {
      throw new Error(`Failed to create sync record: ${syncErr?.message}`);
    }
    const syncId = syncRecord.id;

    try {
      // Get all projects with appfolio_property_id set
      const { data: projects } = await supabase
        .from("projects")
        .select("id, appfolio_property_id")
        .not("appfolio_property_id", "is", null)
        .neq("appfolio_property_id", "");

      if (!projects || projects.length === 0) {
        await supabase
          .from("appfolio_syncs")
          .update({ status: "completed", records_fetched: 0, records_upserted: 0, records_unmapped: 0, completed_at: new Date().toISOString() })
          .eq("id", syncId);

        return NextResponse.json({
          syncId,
          status: "completed",
          message: "No projects with AppFolio Property ID configured",
          records_fetched: 0,
          records_upserted: 0,
        });
      }

      const propertyIds = [
        ...new Set(
          projects
            .map((p: { appfolio_property_id: string | null }) => p.appfolio_property_id)
            .filter(Boolean) as string[]
        ),
      ];

      // Build property_id → project_id map (take first match if duplicates)
      const propertyToProject = new Map<string, string>();
      for (const p of projects as { id: string; appfolio_property_id: string }[]) {
        if (!propertyToProject.has(p.appfolio_property_id)) {
          propertyToProject.set(p.appfolio_property_id, p.id);
        }
      }

      // Fetch balance sheet from AppFolio
      const rows = await fetchBalanceSheet({ propertyIds, asOfDate, accountingBasis });

      // Log the first raw row so field-name issues are visible in server logs
      if (rows.length > 0) {
        console.log("[sync-balance-sheet] First raw row from AppFolio:", JSON.stringify(rows[0]));
      }

      // Upsert into gl_balances
      let upsertedCount = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const upsertRows = batch.map((row) => ({
          appfolio_property_id: String(row.property_id),
          project_id: propertyToProject.get(String(row.property_id)) ?? null,
          gl_account_id: String(row.account_id),
          gl_account_name: row.account_name ?? "",
          gl_account_number: row.account_number ?? null,
          account_type: row.account_type ?? "Other",
          balance: Number(row.balance ?? 0),
          as_of_date: asOfDate,
          accounting_basis: accountingBasis,
          sync_id: syncId,
        }));

        const { error: upsertErr } = await supabase
          .from("gl_balances")
          .upsert(upsertRows, {
            onConflict: "appfolio_property_id,gl_account_id,as_of_date,accounting_basis",
          });

        if (upsertErr) {
          // Surface the error — include the first row so field-mapping issues are visible
          throw new Error(
            `gl_balances upsert failed: ${upsertErr.message} | first row: ${JSON.stringify(upsertRows[0])}`
          );
        }
        upsertedCount += upsertRows.length;
      }

      await supabase
        .from("appfolio_syncs")
        .update({
          status: "completed",
          records_fetched: rows.length,
          records_upserted: upsertedCount,
          records_unmapped: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      return NextResponse.json({
        syncId,
        status: "completed",
        records_fetched: rows.length,
        records_upserted: upsertedCount,
        projects_synced: projects.length,
        as_of_date: asOfDate,
        accounting_basis: accountingBasis,
      });
    } catch (err) {
      await supabase
        .from("appfolio_syncs")
        .update({ status: "failed", error_message: err instanceof Error ? err.message : "Unknown error", completed_at: new Date().toISOString() })
        .eq("id", syncId);
      throw err;
    }
  } catch (err) {
    console.error("[appfolio/sync-balance-sheet]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

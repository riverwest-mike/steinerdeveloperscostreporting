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

      // Deduplicate property IDs; build property → project map
      const propertyToProject = new Map<string, string>();
      for (const p of projects as { id: string; appfolio_property_id: string }[]) {
        if (!propertyToProject.has(p.appfolio_property_id)) {
          propertyToProject.set(p.appfolio_property_id, p.id);
        }
      }
      const uniqueProperties = Array.from(propertyToProject.keys());

      // Fetch and upsert one property at a time so we always know which
      // property the rows belong to (AppFolio doesn't include property_id per row).
      let totalFetched = 0;
      let upsertedCount = 0;
      const BATCH_SIZE = 100;

      for (const propertyId of uniqueProperties) {
        const rows = await fetchBalanceSheet({
          propertyIds: [propertyId],
          asOfDate,
          accountingBasis,
        });

        totalFetched += rows.length;

        // Log all field names from the first row of the first property to aid debugging
        if (rows.length > 0 && upsertedCount === 0 && totalFetched === rows.length) {
          console.log(
            "[sync-balance-sheet] Raw field names from AppFolio:",
            Object.keys(rows[0] as object).join(", ")
          );
          console.log("[sync-balance-sheet] First raw row:", JSON.stringify(rows[0]));
        }

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const upsertRows = batch.map((row) => {
            const r = row as Record<string, unknown>;
            // account_number is confirmed present; use it as the stable unique key.
            const accountId = String(
              r.account_number ?? r.account_id ?? r.gl_account_id ?? r.id ?? ""
            );
            // Try every plausible field name AppFolio might use for the account type/section.
            const accountType = String(
              r.account_type ?? r.type ?? r.account_class ?? r.classification ??
              r.category ?? r.section ?? r.account_section ?? "Other"
            );
            return {
              appfolio_property_id: propertyId,
              project_id: propertyToProject.get(propertyId) ?? null,
              gl_account_id: accountId,
              gl_account_name: String(r.account_name ?? r.gl_account_name ?? ""),
              gl_account_number: r.account_number != null ? String(r.account_number) : null,
              account_type: accountType,
              balance: Number(r.balance ?? 0),
              as_of_date: asOfDate,
              accounting_basis: accountingBasis,
              sync_id: syncId,
            };
          });

          const { error: upsertErr } = await supabase
            .from("gl_balances")
            .upsert(upsertRows, {
              onConflict: "appfolio_property_id,gl_account_id,as_of_date,accounting_basis",
            });

          if (upsertErr) {
            throw new Error(
              `gl_balances upsert failed: ${upsertErr.message} | ` +
              `raw keys: ${Object.keys(rows[0] as object).join(", ")} | ` +
              `first mapped row: ${JSON.stringify(upsertRows[0])}`
            );
          }
          upsertedCount += upsertRows.length;
        }
      }

      await supabase
        .from("appfolio_syncs")
        .update({
          status: "completed",
          records_fetched: totalFetched,
          records_upserted: upsertedCount,
          records_unmapped: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      return NextResponse.json({
        syncId,
        status: "completed",
        records_fetched: totalFetched,
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

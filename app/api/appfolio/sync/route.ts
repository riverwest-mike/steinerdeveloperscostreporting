import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchVendorLedger, parseCostCategory, type VendorLedgerRow } from "@/lib/appfolio";

/**
 * POST /api/appfolio/sync
 *
 * Admin-only endpoint that:
 * 1. Creates an appfolio_syncs record
 * 2. Fetches vendor_ledger from AppFolio for all projects with appfolio_property_id
 *    (vendor_ledger includes the Project Cost Category field used for matching)
 * 3. Upserts into appfolio_transactions (keyed by appfolio_bill_id)
 * 4. Returns sync stats
 */
export async function POST(request: Request) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Parse optional body params
    let fromDate: string;
    let toDate: string;
    let propertyId: string | null = null;
    let adminOnly = false;
    try {
      const body = await request.json();
      fromDate = body.fromDate ?? getDefaultFromDate();
      toDate = body.toDate ?? getDefaultToDate();
      propertyId = body.propertyId ?? null;
      adminOnly = !propertyId; // full sync (no propertyId) requires admin
    } catch {
      fromDate = getDefaultFromDate();
      toDate = getDefaultToDate();
      adminOnly = true;
    }

    if (adminOnly) {
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (user?.role !== "admin") {
        return NextResponse.json({ error: "Admin role required for full sync" }, { status: 403 });
      }
    }

    // Create sync record
    const { data: syncRecord, error: syncErr } = await supabase
      .from("appfolio_syncs")
      .insert({
        triggered_by: userId,
        sync_type: "manual",
        status: "running",
      })
      .select("id")
      .single();
    if (syncErr || !syncRecord) {
      throw new Error(`Failed to create sync record: ${syncErr?.message}`);
    }
    const syncId = syncRecord.id;

    try {
      // Get projects with appfolio_property_id set (optionally filtered to one property)
      let projectQuery = supabase
        .from("projects")
        .select("id, name, appfolio_property_id")
        .not("appfolio_property_id", "is", null)
        .neq("appfolio_property_id", "");
      if (propertyId) {
        projectQuery = projectQuery.eq("appfolio_property_id", propertyId);
      }
      const { data: projects } = await projectQuery;

      if (!projects || projects.length === 0) {
        await supabase
          .from("appfolio_syncs")
          .update({
            status: "completed",
            records_fetched: 0,
            records_upserted: 0,
            records_unmapped: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncId);

        return NextResponse.json({
          syncId,
          status: "completed",
          message: "No projects with AppFolio Property ID configured",
          records_fetched: 0,
          records_upserted: 0,
        });
      }

      // Collect all unique property IDs
      const propertyIds = [
        ...new Set(
          projects
            .map((p: { appfolio_property_id: string | null }) => p.appfolio_property_id)
            .filter(Boolean) as string[]
        ),
      ];

      // Fetch vendor ledger from AppFolio (contains Project Cost Category)
      const rows = await fetchVendorLedger({
        propertyIds,
        fromDate,
        toDate,
        paymentStatus: "All",
      });

      // ── Load bridge_mappings for all synced projects ──────────────────────
      // Maps  gl_account_id (and/or vendor_name_pattern) → cost_category_code
      // Used as a fallback when AppFolio doesn't supply project_cost_category.
      interface BridgeRule {
        gl_account_id: string | null;
        vendor_name_pattern: string | null;
        match_type: "exact" | "contains" | "starts_with";
        priority: number;
        cost_category_code: string;
        cost_category_name: string;
        appfolio_property_id: string;
      }
      const bridgeRules: BridgeRule[] = [];
      {
        const projectIds = projects.map((p: { id: string }) => p.id);
        const { data: rawBridge } = await supabase
          .from("bridge_mappings")
          .select(
            "gl_account_id, vendor_name_pattern, match_type, priority, " +
            "cost_category_id, project_id"
          )
          .in("project_id", projectIds)
          .eq("is_active", true)
          .order("priority", { ascending: true });

        if (rawBridge && rawBridge.length > 0) {
          const catIds = [...new Set((rawBridge as { cost_category_id: string }[]).map((r) => r.cost_category_id))];
          const { data: cats } = await supabase
            .from("cost_categories")
            .select("id, code, name")
            .in("id", catIds);
          const catMap = new Map<string, { id: string; code: string; name: string }>(
            (cats ?? []).map((c: { id: string; code: string; name: string }) => [c.id, c])
          );

          // Build property_id → project map for looking up appfolio_property_id
          const projMap = new Map<string, string>(
            projects
              .filter((p: { id: string; appfolio_property_id: string | null }) => p.appfolio_property_id)
              .map((p: { id: string; appfolio_property_id: string | null }) => [p.id, p.appfolio_property_id as string])
          );

          for (const rule of rawBridge as {
            gl_account_id: string | null;
            vendor_name_pattern: string | null;
            match_type: "exact" | "contains" | "starts_with";
            priority: number;
            cost_category_id: string;
            project_id: string;
          }[]) {
            const cat = catMap.get(rule.cost_category_id);
            const propId = projMap.get(rule.project_id);
            if (cat && propId) {
              bridgeRules.push({
                gl_account_id: rule.gl_account_id,
                vendor_name_pattern: rule.vendor_name_pattern,
                match_type: rule.match_type,
                priority: rule.priority,
                cost_category_code: cat.code,
                cost_category_name: cat.name,
                appfolio_property_id: propId,
              });
            }
          }
        }
      }

      function applyBridgeRules(
        glAccountId: string,
        vendorName: string,
        applyPropertyId: string
      ): { code: string; name: string } | null {
        const relevant = bridgeRules.filter((r) => r.appfolio_property_id === applyPropertyId);
        for (const rule of relevant) {
          // GL account must match if specified
          if (rule.gl_account_id && rule.gl_account_id !== glAccountId) continue;
          // Vendor pattern must match if specified
          if (rule.vendor_name_pattern) {
            const pattern = rule.vendor_name_pattern.toLowerCase();
            const vendor = vendorName.toLowerCase();
            if (rule.match_type === "exact" && vendor !== pattern) continue;
            if (rule.match_type === "contains" && !vendor.includes(pattern)) continue;
            if (rule.match_type === "starts_with" && !vendor.startsWith(pattern)) continue;
          }
          return { code: rule.cost_category_code, name: rule.cost_category_name };
        }
        return null;
      }

      // ── Upsert transactions ───────────────────────────────────────────────
      let upsertedCount = 0;
      let unmappedCount = 0;
      const BATCH_SIZE = 100;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        // Build preliminary rows (AppFolio data only)
        const prelimRows = batch.map((row: VendorLedgerRow) => {
          const paidAmt = parseFloat(row.paid ?? "0") || 0;
          const unpaidAmt = parseFloat(row.unpaid ?? "0") || 0;
          const { code: costCode, name: costName } = parseCostCategory(row.project_cost_category);
          return {
            appfolio_bill_id: String(row.payable_invoice_detail_id),
            appfolio_property_id: String(row.property_id ?? ""),
            vendor_name: row.payee_name ?? "Unknown",
            gl_account_id: row.account_number ?? "",
            gl_account_name: row.account_name ?? "",
            _appfolio_code: costCode ?? null,   // what AppFolio returned
            _appfolio_name: costName ?? null,
            bill_date: row.bill_date ?? null,
            due_date: row.due_date ?? null,
            payment_date: row.payment_date ?? null,
            invoice_amount: paidAmt + unpaidAmt,
            paid_amount: paidAmt,
            unpaid_amount: unpaidAmt,
            payment_type: null,
            check_number: row.check_number ?? null,
            payment_status: unpaidAmt === 0 ? "Paid" : paidAmt === 0 ? "Unpaid" : "Partial",
            reference_number: null,
            description: row.description ?? null,
            property_name: row.property_name ?? null,
            sync_id: syncId,
          };
        });

        // For rows with no AppFolio category: fetch existing DB values so we
        // don't accidentally overwrite a previously-classified transaction.
        const needsLookup = prelimRows
          .filter((r) => !r._appfolio_code)
          .map((r) => r.appfolio_bill_id);

        const existingMap = new Map<string, { cost_category_code: string | null; cost_category_name: string | null }>();
        if (needsLookup.length > 0) {
          const { data: existing } = await supabase
            .from("appfolio_transactions")
            .select("appfolio_bill_id, cost_category_code, cost_category_name")
            .in("appfolio_bill_id", needsLookup);
          for (const e of (existing ?? []) as { appfolio_bill_id: string; cost_category_code: string | null; cost_category_name: string | null }[]) {
            existingMap.set(e.appfolio_bill_id, e);
          }
        }

        // Resolve final cost_category_code: AppFolio → bridge_mapping → existing DB value
        const upsertRows = prelimRows.map((row) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _appfolio_code, _appfolio_name, ...rest } = row;

          let finalCode = _appfolio_code;
          let finalName = _appfolio_name;

          if (!finalCode) {
            // Try bridge mappings
            const bridgeMatch = applyBridgeRules(row.gl_account_id, row.vendor_name, row.appfolio_property_id);
            if (bridgeMatch) {
              finalCode = bridgeMatch.code;
              finalName = bridgeMatch.name;
            }
          }

          if (!finalCode) {
            // Preserve existing DB value rather than overwriting with null
            const prev = existingMap.get(row.appfolio_bill_id);
            if (prev?.cost_category_code) {
              finalCode = prev.cost_category_code;
              finalName = prev.cost_category_name ?? null;
            }
          }

          if (!finalCode) unmappedCount++;

          return {
            ...rest,
            cost_category_code: finalCode ?? null,
            cost_category_name: finalName ?? null,
          };
        });

        const { error: upsertErr } = await supabase
          .from("appfolio_transactions")
          .upsert(upsertRows, { onConflict: "appfolio_bill_id" });

        if (upsertErr) {
          console.error("[sync] Upsert batch error:", upsertErr.message);
        } else {
          upsertedCount += upsertRows.length;
        }
      }

      // Mark sync complete
      await supabase
        .from("appfolio_syncs")
        .update({
          status: "completed",
          records_fetched: rows.length,
          records_upserted: upsertedCount,
          records_unmapped: unmappedCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      return NextResponse.json({
        syncId,
        status: "completed",
        records_fetched: rows.length,
        records_upserted: upsertedCount,
        records_unmapped: unmappedCount,
        projects_synced: projects.length,
        date_range: { fromDate, toDate },
      });
    } catch (err) {
      await supabase
        .from("appfolio_syncs")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);

      throw err;
    }
  } catch (err) {
    console.error("[appfolio/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

/* ─── Helpers ──────────────────────────────────────────── */

function getDefaultFromDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split("T")[0];
}

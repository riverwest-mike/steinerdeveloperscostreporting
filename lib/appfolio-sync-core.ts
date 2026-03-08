/**
 * Core AppFolio vendor-ledger sync logic, shared between the manual
 * admin endpoint (/api/appfolio/sync) and the scheduled cron endpoint
 * (/api/cron/daily-sync).
 */

import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchVendorLedger,
  parseCostCategory,
  getProjectCostCategory,
  type VendorLedgerRow,
} from "@/lib/appfolio";

export interface SyncOptions {
  syncType: "manual" | "scheduled";
  /** Clerk user ID for manual runs; null for scheduled cron runs. */
  triggeredBy: string | null;
  /** If set, restrict sync to a single AppFolio property ID. */
  propertyId?: string | null;
  fromDate?: string;
  toDate?: string;
}

export interface SyncResult {
  syncId: string;
  status: "completed" | "failed";
  records_fetched: number;
  records_upserted: number;
  records_unmapped: number;
  projects_synced: number;
  date_range: { fromDate: string; toDate: string };
  error?: string;
}

export async function runAppfolioSync(opts: SyncOptions): Promise<SyncResult> {
  const supabase = createAdminClient();

  const fromDate = opts.fromDate ?? getDefaultFromDate();
  const toDate = opts.toDate ?? getDefaultToDate();

  // Create sync record
  const { data: syncRecord, error: syncErr } = await supabase
    .from("appfolio_syncs")
    .insert({
      triggered_by: opts.triggeredBy,
      sync_type: opts.syncType,
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
    if (opts.propertyId) {
      projectQuery = projectQuery.eq("appfolio_property_id", opts.propertyId);
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

      return {
        syncId,
        status: "completed",
        records_fetched: 0,
        records_upserted: 0,
        records_unmapped: 0,
        projects_synced: 0,
        date_range: { fromDate, toDate },
      };
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

    // ── Upsert transactions ─────────────────────────────────────────────────
    let upsertedCount = 0;
    let unmappedCount = 0;
    const BATCH_SIZE = 100;

    if (rows.length > 0) {
      const sampleKeys = Object.keys(rows[0] as object);
      console.log(`[sync:${opts.syncType}] AppFolio vendor_ledger first-row keys:`, sampleKeys.join(", "));
      const costCatRaw = getProjectCostCategory(rows[0] as VendorLedgerRow);
      console.log(`[sync:${opts.syncType}] project_cost_category sample value:`, costCatRaw);
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const rawPrelimRows = batch.map((row: VendorLedgerRow) => {
        const paidAmt = parseFloat(row.paid ?? "0") || 0;
        const unpaidAmt = parseFloat(row.unpaid ?? "0") || 0;

        const { code: costCode, name: costName } = parseCostCategory(getProjectCostCategory(row));
        return {
          appfolio_bill_id: String(row.payable_invoice_detail_id),
          appfolio_property_id: String(row.property_id ?? ""),
          vendor_name: row.payee_name ?? "Unknown",
          gl_account_id: row.account_number ?? "",
          gl_account_name: row.account_name ?? "",
          _appfolio_code: costCode ?? null,
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

      // Deduplicate by appfolio_bill_id — prefer entries that have a cost code
      const seenBillIds = new Map<string, typeof rawPrelimRows[0]>();
      for (const row of rawPrelimRows) {
        const prev = seenBillIds.get(row.appfolio_bill_id);
        if (!prev || (!prev._appfolio_code && row._appfolio_code)) {
          seenBillIds.set(row.appfolio_bill_id, row);
        }
      }
      const prelimRows = [...seenBillIds.values()];

      // For rows AppFolio returned no cost code for, preserve the existing DB value
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

      const upsertRows = prelimRows.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _appfolio_code, _appfolio_name, ...rest } = row;

        let finalCode = _appfolio_code;
        let finalName = _appfolio_name;

        if (!finalCode) {
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
        console.error(`[sync:${opts.syncType}] Upsert batch error:`, upsertErr.message);
      } else {
        upsertedCount += upsertRows.length;
      }
    }

    // ── Gate auto-assignment ─────────────────────────────────────────────────
    // For each synced transaction that doesn't already have a manual override,
    // assign it to the gate whose start_date <= bill_date <= end_date.
    await autoAssignGates(supabase, projects as { id: string; appfolio_property_id: string | null }[]);

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

    return {
      syncId,
      status: "completed",
      records_fetched: rows.length,
      records_upserted: upsertedCount,
      records_unmapped: unmappedCount,
      projects_synced: projects.length,
      date_range: { fromDate, toDate },
    };
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
}

/* ─── Gate auto-assignment ─────────────────────────────── */

/**
 * For every transaction that belongs to one of the given projects and does NOT
 * already have a manual gate override, find the gate whose date window covers
 * the transaction's bill_date and upsert a transaction_gate_assignments row.
 *
 * Matching rule: gate.start_date <= bill_date <= gate.end_date
 * Only gates with status 'active' or 'closed' are considered (not 'pending').
 * If multiple gates match (shouldn't happen), the lowest sequence_number wins.
 * Transactions with no matching gate are left unassigned.
 */
export async function autoAssignGates(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createAdminClient>,
  projects: { id: string; appfolio_property_id: string | null }[]
): Promise<void> {
  if (projects.length === 0) return;

  const projectIds = projects.map((p) => p.id);

  // Fetch all active/closed gates with date windows for these projects
  const { data: gates } = await supabase
    .from("gates")
    .select("id, project_id, name, sequence_number, start_date, end_date, status")
    .in("project_id", projectIds)
    .in("status", ["active", "closed"])
    .not("start_date", "is", null)
    .not("end_date", "is", null)
    .order("sequence_number", { ascending: true });

  if (!gates || gates.length === 0) return;

  // Build map: project_id → sorted gates with date windows
  type GateRow = { id: string; project_id: string; sequence_number: number; start_date: string; end_date: string };
  const gatesByProject = new Map<string, GateRow[]>();
  for (const g of gates as GateRow[]) {
    if (!gatesByProject.has(g.project_id)) gatesByProject.set(g.project_id, []);
    gatesByProject.get(g.project_id)!.push(g);
  }

  // Build map: appfolio_property_id → project_id
  const propertyToProjectId = new Map<string, string>();
  for (const p of projects) {
    if (p.appfolio_property_id) propertyToProjectId.set(p.appfolio_property_id, p.id);
  }

  const propertyIds = [...propertyToProjectId.keys()];
  if (propertyIds.length === 0) return;

  // Fetch transactions for these properties that have a bill_date
  const { data: transactions } = await supabase
    .from("appfolio_transactions")
    .select("id, appfolio_property_id, bill_date")
    .in("appfolio_property_id", propertyIds)
    .not("bill_date", "is", null);

  if (!transactions || transactions.length === 0) return;

  // Fetch existing manual overrides so we don't overwrite them
  const txIds = (transactions as { id: string }[]).map((t) => t.id);
  const overrideSet = new Set<string>();
  // Fetch in batches to avoid URL limits
  const BATCH = 500;
  for (let i = 0; i < txIds.length; i += BATCH) {
    const { data: existing } = await supabase
      .from("transaction_gate_assignments")
      .select("appfolio_transaction_id, is_override")
      .in("appfolio_transaction_id", txIds.slice(i, i + BATCH))
      .eq("is_override", true);
    for (const e of (existing ?? []) as { appfolio_transaction_id: string }[]) {
      overrideSet.add(e.appfolio_transaction_id);
    }
  }

  // Compute assignments
  type Assignment = { appfolio_transaction_id: string; gate_id: string; is_override: boolean; assigned_by: null; assigned_at: string };
  const assignments: Assignment[] = [];
  const now = new Date().toISOString();

  for (const tx of transactions as { id: string; appfolio_property_id: string; bill_date: string }[]) {
    if (overrideSet.has(tx.id)) continue; // don't overwrite manual assignments

    const projectId = propertyToProjectId.get(tx.appfolio_property_id);
    if (!projectId) continue;

    const projectGates = gatesByProject.get(projectId);
    if (!projectGates) continue;

    // Find the gate whose window covers bill_date (lowest sequence wins if multiple)
    const matched = projectGates.find(
      (g) => tx.bill_date >= g.start_date && tx.bill_date <= g.end_date
    );
    if (!matched) continue;

    assignments.push({
      appfolio_transaction_id: tx.id,
      gate_id: matched.id,
      is_override: false,
      assigned_by: null,
      assigned_at: now,
    });
  }

  // Upsert in batches, skipping any that already have is_override=true
  for (let i = 0; i < assignments.length; i += BATCH) {
    await supabase
      .from("transaction_gate_assignments")
      .upsert(assignments.slice(i, i + BATCH), {
        onConflict: "appfolio_transaction_id",
        ignoreDuplicates: false,
      });
  }
}

/* ─── Date helpers ─────────────────────────────────────── */

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getDefaultFromDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return localDateStr(d);
}

export function getDefaultToDate(): string {
  // Cap at yesterday — AppFolio returns unposted pending records for today
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

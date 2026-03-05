export const dynamic = "force-dynamic";

import { Fragment } from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";
import { ExportButtons } from "./export-buttons";

/* ─── Helpers ─────────────────────────────────────────── */

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): string {
  return localDateStr(new Date());
}

/** AppFolio intraday transactions (occurred_on = today) lack project_cost_category.
 *  Cap the bill_date filter at yesterday so stale or pending records never appear
 *  in the report, regardless of what asOf date the user selected. */
function appfolioDateCap(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function usd(n: number): string {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + "%";
}

/* ─── Types ───────────────────────────────────────────── */

interface CategoryRow {
  id: string;
  code: string;
  name: string;
  section: string;
  // A
  a_original: number;
  // B
  b_authorized: number;
  // C = A+B
  c_current: number;
  // D
  d_proposed: number;
  // E = C+D
  e_projected: number;
  // F = A-E
  f_variance: number;
  // G
  g_committed: number;
  // H = G/C
  h_pct_committed: number | null;
  // I = C-G
  i_uncommitted: number;
  // J = paid incurred costs
  j_paid: number;
  // K = unpaid incurred costs
  k_unpaid: number;
  // L = J+K total incurred
  l_total_incurred: number;
  // M = C-L balance to complete
  m_balance: number;
}

interface SectionTotals {
  a: number; b: number; c: number; d: number; e: number; f: number;
  g: number; i: number; j: number; k: number; l: number; m: number;
}

function emptyTotals(): SectionTotals {
  return { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0, l: 0, m: 0 };
}

function addToTotals(t: SectionTotals, r: CategoryRow): SectionTotals {
  return {
    a: t.a + r.a_original,
    b: t.b + r.b_authorized,
    c: t.c + r.c_current,
    d: t.d + r.d_proposed,
    e: t.e + r.e_projected,
    f: t.f + r.f_variance,
    g: t.g + r.g_committed,
    i: t.i + r.i_uncommitted,
    j: t.j + r.j_paid,
    k: t.k + r.k_unpaid,
    l: t.l + r.l_total_incurred,
    m: t.m + r.m_balance,
  };
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: { projectIds?: string; projectId?: string; asOf?: string };
}

export default async function CostManagementReportPage({ searchParams }: Props) {
  // Support new ?projectIds=id1,id2 and legacy ?projectId=id (single project backward compat)
  const rawIds = searchParams.projectIds ?? searchParams.projectId ?? null;
  const projectIds = rawIds ? rawIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const asOf = searchParams.asOf ?? today();

  const supabase = createAdminClient();

  // Always load project list for the picker
  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .order("name");

  const projects = (allProjects ?? []) as { id: string; name: string; code: string; appfolio_property_id: string | null }[];

  // ── If no projects selected, render just the controls ──
  if (projectIds.length === 0) {
    return (
      <div>
        <Header title="Project Cost Management Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            currentProjectIds={[]}
            currentAsOf={asOf}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">Select one or more projects above to generate the report.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Resolve selected projects ─────────────────────────
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id));
  // When only one project is selected, drill-down links to cost detail are available
  const singleProject = selectedProjects.length === 1 ? selectedProjects[0] : null;
  // All AppFolio property IDs linked to selected projects
  const linkedPropertyIds = selectedProjects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  // ── Load cost categories (ordered) ───────────────────
  const { data: rawCategories } = await supabase
    .from("cost_categories")
    .select("id, name, code, description, display_order")
    .eq("is_active", true)
    .order("display_order");

  interface CatRecord {
    id: string; name: string; code: string;
    description: string | null; display_order: number;
  }

  const categories = (rawCategories ?? []) as CatRecord[];

  // ── Load gates for all selected projects ─────────────
  const { data: rawGates, error: gatesError } = await supabase
    .from("gates")
    .select("id, name, sequence_number, status")
    .in("project_id", projectIds)
    .order("sequence_number");

  const gateIds = (rawGates ?? []).map((g: { id: string }) => g.id);
  const gateCount = gateIds.length;

  // ── A + B: gate_budgets (all gates, all time) ─────────
  const budgetMap = new Map<string, { a: number; b: number }>();
  let budgetRowCount = 0;
  let budgetTotalOriginal = 0;
  let budgetError: string | null = null;

  if (gatesError) {
    budgetError = `Could not load gates: ${gatesError.message}`;
  } else if (gateIds.length > 0) {
    const { data: rawBudgets, error: rawBudgetsError } = await supabase
      .from("gate_budgets")
      .select("cost_category_id, original_budget, approved_co_amount")
      .in("gate_id", gateIds);

    if (rawBudgetsError) {
      budgetError = `Could not load gate budgets: ${rawBudgetsError.message}`;
    } else {
      budgetRowCount = (rawBudgets ?? []).length;
      for (const b of (rawBudgets ?? []) as {
        cost_category_id: string;
        original_budget: number;
        approved_co_amount: number;
      }[]) {
        const prev = budgetMap.get(b.cost_category_id) ?? { a: 0, b: 0 };
        budgetMap.set(b.cost_category_id, {
          a: prev.a + Number(b.original_budget),
          b: prev.b + Number(b.approved_co_amount),
        });
        budgetTotalOriginal += Number(b.original_budget);
      }
    }
  }

  // ── D: proposed change orders (proposed_date <= asOf) ─
  const proposedMap = new Map<string, number>();
  {
    const { data: rawCOs } = await supabase
      .from("change_orders")
      .select("cost_category_id, amount")
      .in("project_id", projectIds)
      .eq("status", "proposed")
      .lte("proposed_date", asOf);

    for (const co of (rawCOs ?? []) as { cost_category_id: string; amount: number }[]) {
      proposedMap.set(
        co.cost_category_id,
        (proposedMap.get(co.cost_category_id) ?? 0) + Number(co.amount)
      );
    }
  }

  // ── G: contract commitments (execution_date <= asOf or null) ──
  const committedMap = new Map<string, number>();
  {
    let contractQuery = supabase
      .from("contracts")
      .select("cost_category_id, revised_value")
      .in("project_id", projectIds)
      .neq("status", "terminated");

    // Include contracts with no execution_date OR execution_date <= asOf
    contractQuery = contractQuery.or(
      `execution_date.is.null,execution_date.lte.${asOf}`
    );

    const { data: rawContracts } = await contractQuery;

    for (const c of (rawContracts ?? []) as {
      cost_category_id: string;
      revised_value: number;
    }[]) {
      committedMap.set(
        c.cost_category_id,
        (committedMap.get(c.cost_category_id) ?? 0) + Number(c.revised_value)
      );
    }
  }

  // ── J/K: AppFolio actuals (bill_date <= asOf) — paid and unpaid separately ──
  // Match on cost_category_code stored from vendor_ledger sync.
  // e.g. AppFolio "010700 Survey" → code "010700" matches cost_category.code "010700"
  const paidMap = new Map<string, number>();
  const unpaidMap = new Map<string, number>();
  let txTotal = 0;
  let txMatched = 0;
  // unmatched: cost_category_code -> { name, paid, unpaid }
  const unmatchedCats = new Map<string, { name: string; paid: number; unpaid: number }>();

  if (linkedPropertyIds.length > 0) {
    // Build code → category id lookup (case-insensitive).
    // Index by two keys per category to handle both formats:
    //   1. Exact code as stored (e.g. "010700" or "010700 SURVEY")
    //   2. The leading numeric prefix only (e.g. "010700") — so categories
    //      whose code was entered as "010700 Survey" still match transactions
    //      stored as "010700" by parseCostCategory.
    const codeToCategory = new Map<string, string>();
    for (const cat of categories) {
      const full = cat.code.trim().toUpperCase();
      codeToCategory.set(full, cat.id);
      // Also index by numeric prefix (everything before the first space)
      const spaceIdx = full.indexOf(" ");
      if (spaceIdx > 0) {
        const prefix = full.slice(0, spaceIdx);
        if (!codeToCategory.has(prefix)) codeToCategory.set(prefix, cat.id);
      }
    }

    const txDateCap = asOf < appfolioDateCap() ? asOf : appfolioDateCap();
    const { data: rawTx } = await supabase
      .from("appfolio_transactions")
      .select("cost_category_code, cost_category_name, vendor_name, paid_amount, unpaid_amount")
      .in("appfolio_property_id", linkedPropertyIds)
      .lte("bill_date", txDateCap);

    for (const tx of (rawTx ?? []) as {
      cost_category_code: string | null;
      cost_category_name: string | null;
      vendor_name: string;
      paid_amount: number;
      unpaid_amount: number;
    }[]) {
      txTotal++;
      const code = (tx.cost_category_code ?? "").trim().toUpperCase();
      const paid = Number(tx.paid_amount);
      const unpaid = Number(tx.unpaid_amount);

      const catId = code ? (codeToCategory.get(code) ?? null) : null;

      if (catId) {
        txMatched++;
        paidMap.set(catId, (paidMap.get(catId) ?? 0) + paid);
        unpaidMap.set(catId, (unpaidMap.get(catId) ?? 0) + unpaid);
      } else {
        const displayCode = code || "(no cost category)";
        const displayName = tx.vendor_name || tx.cost_category_name || displayCode;
        const prev = unmatchedCats.get(displayCode) ?? { name: displayName, paid: 0, unpaid: 0 };
        unmatchedCats.set(displayCode, { name: prev.name, paid: prev.paid + paid, unpaid: prev.unpaid + unpaid });
      }
    }
  }

  // ── Build rows ────────────────────────────────────────
  const rows: CategoryRow[] = categories.map((cat) => {
    const budget = budgetMap.get(cat.id) ?? { a: 0, b: 0 };
    const a = budget.a;
    const b = budget.b;
    const c = a + b;
    const d = proposedMap.get(cat.id) ?? 0;
    const e = c + d;
    const f = a - e;
    const g = committedMap.get(cat.id) ?? 0;
    const h_pct = c > 0 ? (g / c) * 100 : null;
    const i = c - g;
    const j = paidMap.get(cat.id) ?? 0;
    const k = unpaidMap.get(cat.id) ?? 0;
    const l = j + k;
    const m = c - l;

    return {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      section: cat.description ?? "Other",
      a_original: a,
      b_authorized: b,
      c_current: c,
      d_proposed: d,
      e_projected: e,
      f_variance: f,
      g_committed: g,
      h_pct_committed: h_pct,
      i_uncommitted: i,
      j_paid: j,
      k_unpaid: k,
      l_total_incurred: l,
      m_balance: m,
    };
  });

  // Phantom rows for AppFolio transactions whose code has no matching cost category
  const UNMATCHED_SECTION = "AppFolio — Unmatched Costs";
  for (const [code, { name, paid, unpaid }] of unmatchedCats.entries()) {
    const total = paid + unpaid;
    rows.push({
      id: `appfolio-unmatched-${code}`,
      code,
      name,
      section: UNMATCHED_SECTION,
      a_original: 0,
      b_authorized: 0,
      c_current: 0,
      d_proposed: 0,
      e_projected: 0,
      f_variance: 0,
      g_committed: 0,
      h_pct_committed: null,
      i_uncommitted: 0,
      j_paid: paid,
      k_unpaid: unpaid,
      l_total_incurred: total,
      m_balance: -total,
    });
  }

  // ── Group by section, only keep sections with any data ─
  const sectionOrder: string[] = [];
  const sectionMap = new Map<string, CategoryRow[]>();
  for (const row of rows) {
    if (!sectionMap.has(row.section)) {
      sectionOrder.push(row.section);
      sectionMap.set(row.section, []);
    }
    sectionMap.get(row.section)!.push(row);
  }

  // Suppress rows where every value is zero
  function rowHasData(r: CategoryRow): boolean {
    return (
      r.a_original !== 0 || r.b_authorized !== 0 || r.d_proposed !== 0 ||
      r.g_committed !== 0 || r.l_total_incurred !== 0
    );
  }

  // Grand totals
  let grand = emptyTotals();
  for (const row of rows) {
    if (rowHasData(row)) grand = addToTotals(grand, row);
  }

  const hasAnyData = rows.some(rowHasData);

  return (
    <div>
      <Header title="Project Cost Management Report" />
      <div className="p-6">

        <div className="print:hidden">
          <ReportControls
            projects={projects}
            currentProjectIds={projectIds}
            currentAsOf={asOf}
          />
        </div>

        {/* Report header */}
        {(() => {
          const projectLabel = selectedProjects.length === 0
            ? "Unknown Project(s)"
            : selectedProjects.length === 1
            ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
            : selectedProjects.map((p) => p.code).join(", ") + ` (${selectedProjects.length} projects)`;
          return (
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Project Cost Management Report</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {projectLabel} &nbsp;·&nbsp; All Gates &nbsp;·&nbsp;{" "}
                  As of{" "}
                  {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <ExportButtons
                rows={rows}
                sectionOrder={sectionOrder}
                projectLabel={projectLabel}
                asOf={asOf}
              />
            </div>
          );
        })()}

        <div className="print:hidden">
          {/* Gate budget diagnostics */}
          {budgetError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <span className="font-semibold">Budget load error:</span> {budgetError}
            </div>
          )}
          {!budgetError && gateCount === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              No gates found for this project — Budget columns A–F will show $0. Create a gate and enter budget amounts to populate this report.
            </div>
          )}
          {!budgetError && gateCount > 0 && budgetRowCount === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              {gateCount} gate{gateCount !== 1 ? "s" : ""} found but no budget amounts have been saved yet — open each gate and click &ldquo;Save Budgets&rdquo; after entering amounts.
            </div>
          )}
          {!budgetError && gateCount > 0 && budgetRowCount > 0 && budgetTotalOriginal === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              {gateCount} gate{gateCount !== 1 ? "s" : ""} · {budgetRowCount} budget line{budgetRowCount !== 1 ? "s" : ""} found but all original budget amounts are $0 — open each gate, enter the budget amounts, and click &ldquo;Save Budgets&rdquo;.
            </div>
          )}
          {!budgetError && gateCount > 0 && budgetRowCount > 0 && budgetTotalOriginal > 0 && (
            <div className="mb-2 text-xs text-muted-foreground">
              {gateCount} gate{gateCount !== 1 ? "s" : ""} · {budgetRowCount} budget line{budgetRowCount !== 1 ? "s" : ""} · {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(budgetTotalOriginal)} original budget loaded
            </div>
          )}

          {linkedPropertyIds.length === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              {selectedProjects.length === 1
                ? "This project is not linked to an AppFolio property"
                : "None of the selected projects are linked to AppFolio properties"}{" "}
              — Cost columns J, K, and L will show $0.
            </div>
          )}

          {linkedPropertyIds.length > 0 && txTotal === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              No AppFolio transactions found as of{" "}
              {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.{" "}
              Run an AppFolio sync in Admin to pull data.
            </div>
          )}

          {linkedPropertyIds.length > 0 && txTotal > 0 && (
            <div className="mb-2 text-xs text-muted-foreground">
              {linkedPropertyIds.length} AppFolio {linkedPropertyIds.length === 1 ? "property" : "properties"}
              {" · "}{txTotal} transaction{txTotal !== 1 ? "s" : ""} found
              {" · "}{txMatched} matched
            </div>
          )}

          {linkedPropertyIds.length > 0 && txTotal > 0 && unmatchedCats.size > 0 && (
            <details className="mb-4 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-900">
              <summary className="cursor-pointer px-4 py-2 font-medium select-none">
                ⚠ {unmatchedCats.size} cost category code{unmatchedCats.size !== 1 ? "s" : ""} from AppFolio not matched
                {" — "}
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
                  Array.from(unmatchedCats.values()).reduce((s, v) => s + v.paid + v.unpaid, 0)
                )}{" "}
                shown below as &ldquo;AppFolio — Unmatched Costs&rdquo; ({txMatched} of {txTotal} transactions matched)
              </summary>
              <div className="border-t border-amber-200 px-4 py-3">
                <p className="mb-2 text-xs text-amber-700">
                  These AppFolio cost category codes do not match any active cost categories in this system.
                  Ensure the cost category codes in AppFolio match those in Admin → Cost Categories.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-amber-700">
                      <th className="text-left pb-1 pr-4">AppFolio Cost Category Code</th>
                      <th className="text-left pb-1 pr-4">AppFolio Cost Category Name</th>
                      <th className="text-right pb-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(unmatchedCats.entries())
                      .sort((a, b) => (b[1].paid + b[1].unpaid) - (a[1].paid + a[1].unpaid))
                      .map(([code, { name, paid, unpaid }]) => (
                        <tr key={code} className="border-t border-amber-100">
                          <td className="py-1 pr-4 font-mono">{code}</td>
                          <td className="py-1 pr-4">{name}</td>
                          <td className="py-1 text-right tabular-nums">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(paid + unpaid)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        {!hasAnyData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No budget, commitment, or cost data found for the selected project{selectedProjects.length !== 1 ? "s" : ""}.
            </p>
          </div>
        ) : (
          <>
          <style>{`
            @media print {
              @page { size: landscape; margin: 0.35in; }
              table { font-size: 6pt !important; min-width: 0 !important; width: 100% !important; }
              th, td { padding: 1pt 2pt !important; }
            }
          `}</style>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead>
                {/* Column letter row */}
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2 text-left font-medium w-20" rowSpan={2}>Cost Code</th>
                  <th className="px-3 py-2 text-left font-medium" rowSpan={2}>Description</th>
                  {/* Budget block */}
                  <th className="px-3 py-2 text-right font-medium border-l border-slate-600">A</th>
                  <th className="px-3 py-2 text-right font-medium">B</th>
                  <th className="px-3 py-2 text-right font-medium">C = A+B</th>
                  <th className="px-3 py-2 text-right font-medium border-l border-slate-600">D</th>
                  <th className="px-3 py-2 text-right font-medium">E = C+D</th>
                  <th className="px-3 py-2 text-right font-medium">F = A-E</th>
                  {/* Commitments block */}
                  <th className="px-3 py-2 text-right font-medium border-l border-slate-600">G</th>
                  <th className="px-3 py-2 text-right font-medium">H = G÷C</th>
                  <th className="px-3 py-2 text-right font-medium">I = C-G</th>
                  {/* Costs block */}
                  <th className="px-3 py-2 text-right font-medium border-l border-slate-600">J</th>
                  <th className="px-3 py-2 text-right font-medium">K</th>
                  <th className="px-3 py-2 text-right font-medium">L = J+K</th>
                  <th className="px-3 py-2 text-right font-medium">M = C-L</th>
                </tr>
                {/* Column name row */}
                <tr className="bg-slate-700 text-slate-100 text-[10px]">
                  {/* Code + Desc spacers are rowSpan=2 above */}
                  <th className="px-3 py-1.5 text-right font-normal border-l border-slate-600 whitespace-nowrap">Original Budget</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Authorized Adj.</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Current Budget</th>
                  <th className="px-3 py-1.5 text-right font-normal border-l border-slate-600 whitespace-nowrap">Proposed Adj.</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Projected Budget</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Variance</th>
                  <th className="px-3 py-1.5 text-right font-normal border-l border-slate-600 whitespace-nowrap">Total Committed</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">% Committed</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Uncommitted</th>
                  <th className="px-3 py-1.5 text-right font-normal border-l border-slate-600 whitespace-nowrap">Costs to Date Paid</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Costs to Date Unpaid</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Total Costs Incurred</th>
                  <th className="px-3 py-1.5 text-right font-normal whitespace-nowrap">Balance to Complete</th>
                </tr>
              </thead>

              <tbody>
                {sectionOrder.map((section) => {
                  const sectionRows = (sectionMap.get(section) ?? []).filter(rowHasData);
                  if (sectionRows.length === 0) return null;

                  // Section totals
                  const st = sectionRows.reduce(addToTotals, emptyTotals());
                  const st_h = st.c > 0 ? (st.g / st.c) * 100 : null;

                  return (
                    <Fragment key={section}>
                      {/* Section header */}
                      <tr className="bg-slate-100 border-t-2 border-slate-300">
                        <td
                          colSpan={15}
                          className="px-3 py-2 font-bold text-slate-700 uppercase tracking-wide text-[10px]"
                        >
                          {section}
                        </td>
                      </tr>

                      {/* Line items */}
                      {sectionRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-mono text-muted-foreground">{row.code}</td>
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-slate-100">{usd(row.a_original)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{usd(row.b_authorized)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{usd(row.c_current)}</td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-slate-100 text-muted-foreground">{usd(row.d_proposed)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(row.e_projected)}</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
                              row.f_variance < 0 ? "text-red-600" : row.f_variance > 0 ? "text-green-700" : "text-muted-foreground"
                            }`}
                          >
                            {usd(row.f_variance)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-slate-100">{usd(row.g_committed)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pct(row.h_pct_committed)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(row.i_uncommitted)}</td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-slate-100">
                            {row.j_paid !== 0 && singleProject?.appfolio_property_id ? (
                              <Link
                                href={`/reports/cost-detail?projectId=${singleProject.id}&asOf=${asOf}&categoryCode=${row.code}&paymentFilter=paid`}
                                className="text-primary underline underline-offset-2 hover:opacity-75"
                              >
                                {usd(row.j_paid)}
                              </Link>
                            ) : (
                              usd(row.j_paid)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.k_unpaid !== 0 && singleProject?.appfolio_property_id ? (
                              <Link
                                href={`/reports/cost-detail?projectId=${singleProject.id}&asOf=${asOf}&categoryCode=${row.code}&paymentFilter=unpaid`}
                                className="text-primary underline underline-offset-2 hover:opacity-75"
                              >
                                {usd(row.k_unpaid)}
                              </Link>
                            ) : (
                              usd(row.k_unpaid)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {row.l_total_incurred !== 0 && singleProject?.appfolio_property_id ? (
                              <Link
                                href={`/reports/cost-detail?projectId=${singleProject.id}&asOf=${asOf}&categoryCode=${row.code}`}
                                className="text-primary underline underline-offset-2 hover:opacity-75"
                              >
                                {usd(row.l_total_incurred)}
                              </Link>
                            ) : (
                              usd(row.l_total_incurred)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(row.m_balance)}</td>
                        </tr>
                      ))}

                      {/* Section subtotal */}
                      <tr className="border-t border-slate-300 bg-slate-50 font-semibold">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Subtotal</td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wide">{section}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{usd(st.a)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.b)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.c)}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{usd(st.d)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.e)}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            st.f < 0 ? "text-red-600" : st.f > 0 ? "text-green-700" : "text-muted-foreground"
                          }`}
                        >
                          {usd(st.f)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{usd(st.g)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pct(st_h)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.i)}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{usd(st.j)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.k)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{usd(st.l)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(st.m)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>

              {/* Grand total */}
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
                  <td className="px-3 py-3" colSpan={2}>TOTAL — ALL CATEGORIES</td>
                  <td className="px-3 py-3 text-right tabular-nums border-l border-slate-600">{usd(grand.a)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.b)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.c)}</td>
                  <td className="px-3 py-3 text-right tabular-nums border-l border-slate-600">{usd(grand.d)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.e)}</td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${
                      grand.f < 0 ? "text-red-400" : grand.f > 0 ? "text-green-400" : ""
                    }`}
                  >
                    {usd(grand.f)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums border-l border-slate-600">{usd(grand.g)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {pct(grand.c > 0 ? (grand.g / grand.c) * 100 : null)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.i)}</td>
                  <td className="px-3 py-3 text-right tabular-nums border-l border-slate-600">{usd(grand.j)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.k)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.l)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(grand.m)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-2 uppercase tracking-wide text-[10px]">Column Definitions</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
              <div><span className="font-semibold text-slate-800">A</span> — Original Budget (sum of all approved gates)</div>
              <div><span className="font-semibold text-slate-800">B</span> — Authorized Adjustments (approved change orders)</div>
              <div><span className="font-semibold text-slate-800">C = A+B</span> — Current Budget</div>
              <div><span className="font-semibold text-slate-800">D</span> — Proposed Adjustments (pending change orders)</div>
              <div><span className="font-semibold text-slate-800">E = C+D</span> — Projected Budget</div>
              <div><span className="font-semibold text-slate-800">F = A−E</span> — Variance (original vs. projected)</div>
              <div><span className="font-semibold text-slate-800">G</span> — Total Committed (active contract values)</div>
              <div><span className="font-semibold text-slate-800">H = G÷C</span> — % of Budget Committed</div>
              <div><span className="font-semibold text-slate-800">I = C−G</span> — Uncommitted Budget</div>
              <div><span className="font-semibold text-slate-800">J</span> — Incurred and Paid Costs (through report date)</div>
              <div><span className="font-semibold text-slate-800">K</span> — Incurred and Unpaid Costs (through report date)</div>
              <div><span className="font-semibold text-slate-800">L = J+K</span> — Total Costs Incurred</div>
              <div><span className="font-semibold text-slate-800">M = C−L</span> — Remaining Gate Spend (Balance to Complete)</div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

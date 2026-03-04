export const dynamic = "force-dynamic";

import { Fragment } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";

/* ─── Helpers ─────────────────────────────────────────── */

function today(): string {
  return new Date().toISOString().split("T")[0];
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
  // J
  j_cost_to_date: number;
  // K = C-J
  k_balance: number;
}

interface SectionTotals {
  a: number; b: number; c: number; d: number; e: number; f: number;
  g: number; i: number; j: number; k: number;
}

function emptyTotals(): SectionTotals {
  return { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0 };
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
    j: t.j + r.j_cost_to_date,
    k: t.k + r.k_balance,
  };
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: { projectId?: string; asOf?: string };
}

export default async function CostManagementReportPage({ searchParams }: Props) {
  const projectId = searchParams.projectId ?? null;
  const asOf = searchParams.asOf ?? today();

  const supabase = createAdminClient();

  // Always load project list for the picker
  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, code")
    .order("name");

  const projects = (allProjects ?? []) as { id: string; name: string; code: string }[];

  // ── If no project selected, render just the controls ──
  if (!projectId) {
    return (
      <div>
        <Header title="Project Cost Management Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            currentProjectId={null}
            currentAsOf={asOf}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">Select a project above to generate the report.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Load project ──────────────────────────────────────
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return (
      <div>
        <Header title="Project Cost Management Report" />
        <div className="p-6">
          <ReportControls projects={projects} currentProjectId={projectId} currentAsOf={asOf} />
          <p className="text-destructive text-sm">Project not found.</p>
        </div>
      </div>
    );
  }

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

  // ── Load gates for this project ───────────────────────
  const { data: rawGates } = await supabase
    .from("gates")
    .select("id")
    .eq("project_id", projectId);

  const gateIds = (rawGates ?? []).map((g: { id: string }) => g.id);

  // ── A + B: gate_budgets (all gates, all time) ─────────
  const budgetMap = new Map<string, { a: number; b: number }>();
  if (gateIds.length > 0) {
    const { data: rawBudgets } = await supabase
      .from("gate_budgets")
      .select("cost_category_id, original_budget, approved_co_amount")
      .in("gate_id", gateIds);

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
    }
  }

  // ── D: proposed change orders (proposed_date <= asOf) ─
  const proposedMap = new Map<string, number>();
  {
    const { data: rawCOs } = await supabase
      .from("change_orders")
      .select("cost_category_id, amount")
      .eq("project_id", projectId)
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
      .eq("project_id", projectId)
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

  // ── J: AppFolio actuals (bill_date <= asOf) ───────────
  const actualsMap = new Map<string, number>();
  if (project.appfolio_property_id) {
    const codeToCategory = new Map<string, string>();
    for (const cat of categories) {
      codeToCategory.set(cat.code.trim().toUpperCase(), cat.id);
    }

    const { data: rawTx } = await supabase
      .from("appfolio_transactions")
      .select("gl_account_id, invoice_amount")
      .eq("appfolio_property_id", project.appfolio_property_id)
      .lte("bill_date", asOf);

    for (const tx of (rawTx ?? []) as { gl_account_id: string; invoice_amount: number }[]) {
      const catId = codeToCategory.get((tx.gl_account_id ?? "").trim().toUpperCase());
      if (catId) {
        actualsMap.set(catId, (actualsMap.get(catId) ?? 0) + Number(tx.invoice_amount));
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
    const j = actualsMap.get(cat.id) ?? 0;
    const k = c - j;

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
      j_cost_to_date: j,
      k_balance: k,
    };
  });

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

  // Filter: keep rows that have at least one non-zero value
  function rowHasData(r: CategoryRow): boolean {
    return r.c_current !== 0 || r.d_proposed !== 0 || r.g_committed !== 0 || r.j_cost_to_date !== 0;
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

        <ReportControls
          projects={projects}
          currentProjectId={projectId}
          currentAsOf={asOf}
        />

        {/* Report header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight">Project Cost Management Report</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code} — {project.name} &nbsp;·&nbsp; All Gates &nbsp;·&nbsp;{" "}
            As of{" "}
            {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {!project.appfolio_property_id && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            This project is not linked to AppFolio — Cost to Date (J) will show $0.
          </div>
        )}

        {!hasAnyData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No budget, commitment, or cost data found for this project.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse" style={{ minWidth: "1100px" }}>
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
                  <th className="px-3 py-2 text-right font-medium">K = C-J</th>
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
                  <th className="px-3 py-1.5 text-right font-normal border-l border-slate-600 whitespace-nowrap">Cost to Date</th>
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
                          colSpan={13}
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
                          <td className="px-3 py-2 text-right tabular-nums border-l border-slate-100">{usd(row.j_cost_to_date)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(row.k_balance)}</td>
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

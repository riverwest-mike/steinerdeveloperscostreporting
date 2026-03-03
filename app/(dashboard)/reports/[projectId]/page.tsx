export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtVariance(n: number): string {
  if (n < 0) return `(${fmtUSD(Math.abs(n))})`;
  return fmtUSD(n);
}

interface ReportRow {
  id: string;
  code: string;
  name: string;
  original: number;
  co: number;
  revised: number;
  actual: number;
  variance: number;
  pctComplete: number | null;
}

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function CostCategoryReportPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: gates }, { data: categories }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, code, appfolio_property_id")
      .eq("id", projectId)
      .single(),
    supabase.from("gates").select("id").eq("project_id", projectId),
    supabase
      .from("cost_categories")
      .select("id, name, code, display_order")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  if (!project) notFound();

  // Aggregate gate_budgets across all gates
  type BudgetTotals = { original: number; co: number; revised: number };
  const budgetMap = new Map<string, BudgetTotals>();

  const gateIds = (gates ?? []).map((g: { id: string }) => g.id);
  if (gateIds.length > 0) {
    const { data: budgets } = await supabase
      .from("gate_budgets")
      .select("cost_category_id, original_budget, approved_co_amount, revised_budget")
      .in("gate_id", gateIds);

    for (const b of (budgets ?? []) as {
      cost_category_id: string;
      original_budget: number;
      approved_co_amount: number;
      revised_budget: number;
    }[]) {
      const prev = budgetMap.get(b.cost_category_id) ?? { original: 0, co: 0, revised: 0 };
      budgetMap.set(b.cost_category_id, {
        original: prev.original + Number(b.original_budget),
        co: prev.co + Number(b.approved_co_amount),
        revised: prev.revised + Number(b.revised_budget),
      });
    }
  }

  // Build actuals from AppFolio transactions (all time, all gates)
  const actualsMap = new Map<string, number>();
  if (project.appfolio_property_id) {
    const codeToCategory = new Map<string, string>();
    for (const cat of (categories ?? []) as { id: string; code: string }[]) {
      codeToCategory.set(cat.code.trim().toUpperCase(), cat.id);
    }

    const { data: transactions } = await supabase
      .from("appfolio_transactions")
      .select("gl_account_id, invoice_amount")
      .eq("appfolio_property_id", project.appfolio_property_id);

    for (const tx of (transactions ?? []) as { gl_account_id: string; invoice_amount: number }[]) {
      const glId = (tx.gl_account_id ?? "").trim().toUpperCase();
      const categoryId = codeToCategory.get(glId);
      if (categoryId) {
        actualsMap.set(categoryId, (actualsMap.get(categoryId) ?? 0) + Number(tx.invoice_amount));
      }
    }
  }

  // Build report rows
  const allRows: ReportRow[] = (categories ?? []).map((cat: { id: string; name: string; code: string }) => {
    const b = budgetMap.get(cat.id) ?? { original: 0, co: 0, revised: 0 };
    const actual = actualsMap.get(cat.id) ?? 0;
    const variance = b.revised - actual;
    const pctComplete = b.revised > 0 ? (actual / b.revised) * 100 : null;
    return { id: cat.id, code: cat.code, name: cat.name, ...b, actual, variance, pctComplete };
  });

  const rows = allRows.filter((r) => r.revised !== 0 || r.actual !== 0);
  const hiddenCount = allRows.length - rows.length;

  // Grand totals
  const totals = rows.reduce(
    (acc, r) => ({
      original: acc.original + r.original,
      co: acc.co + r.co,
      revised: acc.revised + r.revised,
      actual: acc.actual + r.actual,
      variance: acc.variance + r.variance,
    }),
    { original: 0, co: 0, revised: 0, actual: 0, variance: 0 }
  );
  const totalPct = totals.revised > 0 ? (totals.actual / totals.revised) * 100 : null;

  return (
    <div>
      <Header title={`${project.name} — Cost Category Report`} />
      <div className="p-6">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{project.name}</span>
        </nav>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Cost Category Report</h2>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{project.code} — All Gates</p>
          </div>
          {!project.appfolio_property_id && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Not linked to AppFolio — actual spend unavailable
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No budget or spend data found for this project.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Cost Category</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Original Budget</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Approved COs</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Revised Budget</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Actual Spend</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Variance</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">% Complete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-muted-foreground mr-2">{row.code}</span>
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {fmtUSD(row.original)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {row.co !== 0 ? fmtUSD(row.co) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium">
                      {fmtUSD(row.revised)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                      {fmtUSD(row.actual)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums font-medium ${
                      row.variance < 0 ? "text-red-600" : row.variance > 0 ? "text-green-700" : "text-muted-foreground"
                    }`}>
                      {fmtVariance(row.variance)}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-xs font-medium ${
                      row.pctComplete === null
                        ? "text-muted-foreground"
                        : row.pctComplete > 100
                        ? "text-red-600"
                        : "text-foreground"
                    }`}>
                      {row.pctComplete === null ? "—" : `${row.pctComplete.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                  <td className="px-4 py-3 text-sm">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{fmtUSD(totals.original)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{fmtUSD(totals.co)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{fmtUSD(totals.revised)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{fmtUSD(totals.actual)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${
                    totals.variance < 0 ? "text-red-600" : totals.variance > 0 ? "text-green-700" : "text-muted-foreground"
                  }`}>
                    {fmtVariance(totals.variance)}
                  </td>
                  <td className={`px-4 py-3 text-right text-xs ${
                    totalPct === null ? "text-muted-foreground" : totalPct > 100 ? "text-red-600" : "text-foreground"
                  }`}>
                    {totalPct === null ? "—" : `${totalPct.toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {hiddenCount > 0 && rows.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {hiddenCount} cost {hiddenCount === 1 ? "category" : "categories"} with no budget or spend are hidden.
          </p>
        )}
      </div>
    </div>
  );
}

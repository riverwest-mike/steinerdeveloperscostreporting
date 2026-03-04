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

function usdSigned(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/* ─── Account type ordering & display ─────────────────── */

// Canonical order for balance sheet sections
const SECTION_ORDER = ["Asset", "Liability", "Equity"];

function sectionLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "asset":    return "Assets";
    case "liability": return "Liabilities";
    case "equity":   return "Equity";
    default:          return type;
  }
}

/* ─── Types ───────────────────────────────────────────── */

interface GlRow {
  gl_account_id: string;
  gl_account_name: string;
  gl_account_number: string | null;
  account_type: string;
  balance: number;
  as_of_date: string;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: { projectId?: string; asOf?: string; basis?: string };
}

export default async function BalanceSheetReportPage({ searchParams }: Props) {
  const projectId   = searchParams.projectId ?? null;
  const asOf        = searchParams.asOf ?? today();
  const basis       = searchParams.basis === "Cash" ? "Cash" : "Accrual" as "Cash" | "Accrual";

  const supabase = createAdminClient();

  // Always load project list for the picker
  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, code")
    .order("name");

  const projects = (allProjects ?? []) as { id: string; name: string; code: string }[];

  if (!projectId) {
    return (
      <div>
        <Header title="Balance Sheet Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            currentProjectId={null}
            currentAsOf={asOf}
            currentBasis={basis}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">Select a project above to generate the report.</p>
          </div>
        </div>
      </div>
    );
  }

  // Load project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return (
      <div>
        <Header title="Balance Sheet Report" />
        <div className="p-6">
          <ReportControls projects={projects} currentProjectId={projectId} currentAsOf={asOf} currentBasis={basis} />
          <p className="text-destructive text-sm">Project not found.</p>
        </div>
      </div>
    );
  }

  // ── Load GL balances ──────────────────────────────────
  // Use the most recent snapshot on or before the selected date.
  let glRows: GlRow[] = [];
  let actualDate: string | null = null;

  if (project.appfolio_property_id) {
    // Find the latest available as_of_date <= selected date for this property + basis
    const { data: dateRow } = await supabase
      .from("gl_balances")
      .select("as_of_date")
      .eq("appfolio_property_id", project.appfolio_property_id)
      .eq("accounting_basis", basis)
      .lte("as_of_date", asOf)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .single();

    if (dateRow) {
      actualDate = dateRow.as_of_date as string;

      const { data: rawRows } = await supabase
        .from("gl_balances")
        .select("gl_account_id, gl_account_name, gl_account_number, account_type, balance, as_of_date")
        .eq("appfolio_property_id", project.appfolio_property_id)
        .eq("accounting_basis", basis)
        .eq("as_of_date", actualDate)
        .order("gl_account_number", { ascending: true });

      glRows = (rawRows ?? []) as GlRow[];
    }
  }

  // ── Group by account_type ────────────────────────────
  // Normalise type: capitalise first letter for grouping
  function normaliseType(t: string): string {
    const lower = t.toLowerCase();
    if (lower.startsWith("asset"))     return "Asset";
    if (lower.startsWith("liab"))      return "Liability";
    if (lower.startsWith("equit"))     return "Equity";
    return t; // preserve unknown types
  }

  const sectionMap = new Map<string, GlRow[]>();
  for (const row of glRows) {
    const type = normaliseType(row.account_type);
    if (!sectionMap.has(type)) sectionMap.set(type, []);
    sectionMap.get(type)!.push(row);
  }

  // Build display order: known types first (in order), then any unknown types
  const knownInData   = SECTION_ORDER.filter((t) => sectionMap.has(t));
  const unknownInData = Array.from(sectionMap.keys()).filter((t) => !SECTION_ORDER.includes(t));
  const displayOrder  = [...knownInData, ...unknownInData];

  // Compute section totals and grand totals
  const sectionTotals = new Map<string, number>();
  for (const [type, rows] of sectionMap.entries()) {
    sectionTotals.set(type, rows.reduce((s, r) => s + Number(r.balance), 0));
  }

  const totalAssets      = sectionTotals.get("Asset") ?? 0;
  const totalLiabilities = sectionTotals.get("Liability") ?? 0;
  const totalEquity      = sectionTotals.get("Equity") ?? 0;
  const liabPlusEquity   = totalLiabilities + totalEquity;
  const balanceDiff      = totalAssets - liabPlusEquity;
  const isBalanced       = Math.abs(balanceDiff) < 0.01;

  const hasData = glRows.length > 0;

  const displayDate = actualDate
    ? new Date(actualDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <div>
      <Header title="Balance Sheet Report" />
      <div className="p-6">

        <ReportControls
          projects={projects}
          currentProjectId={projectId}
          currentAsOf={asOf}
          currentBasis={basis}
        />

        {/* Report header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight">Balance Sheet</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {project.code} — {project.name}
            {displayDate && <> &nbsp;·&nbsp; As of {displayDate}</>}
            &nbsp;·&nbsp; {basis} Basis
          </p>
        </div>

        {/* Warnings */}
        {!project.appfolio_property_id && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            This project is not linked to an AppFolio property. Link it in Admin → AppFolio to enable balance sheet data.
          </div>
        )}

        {project.appfolio_property_id && !hasData && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            No balance sheet data found for this property on or before{" "}
            {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
            ({basis} basis). Run a Balance Sheet sync in Admin → AppFolio.
          </div>
        )}

        {/* Date note when showing nearest available snapshot */}
        {hasData && actualDate && actualDate !== asOf && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
            Showing the most recent available snapshot ({displayDate}). To see data for{" "}
            {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })},
            run a Balance Sheet sync for that date in Admin → AppFolio.
          </div>
        )}

        {!hasData ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No balance sheet data available. Run a sync in Admin → AppFolio.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ maxWidth: "640px" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-4 py-2.5 text-left font-medium">Account</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-300 text-xs font-normal w-28">Number</th>
                  <th className="px-4 py-2.5 text-right font-medium w-36">Balance</th>
                </tr>
              </thead>

              <tbody>
                {displayOrder.map((type) => {
                  const rows = sectionMap.get(type) ?? [];
                  const total = sectionTotals.get(type) ?? 0;

                  return (
                    <Fragment key={type}>
                      {/* Section header */}
                      <tr className="bg-slate-100 border-t-2 border-slate-300">
                        <td
                          colSpan={3}
                          className="px-4 py-2 font-bold text-slate-700 uppercase tracking-wide text-xs"
                        >
                          {sectionLabel(type)}
                        </td>
                      </tr>

                      {/* Account rows */}
                      {rows.map((row) => (
                        <tr key={row.gl_account_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-2">{row.gl_account_name}</td>
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {row.gl_account_number ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {usdSigned(Number(row.balance))}
                          </td>
                        </tr>
                      ))}

                      {/* Section subtotal */}
                      <tr className="border-t border-slate-300 bg-slate-50 font-semibold text-sm">
                        <td className="px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide" colSpan={2}>
                          Total {sectionLabel(type)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums border-t border-slate-300">
                          {usdSigned(total)}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>

              {/* Balance check footer */}
              <tfoot>
                {/* Liabilities + Equity combined row (shown when both exist) */}
                {sectionMap.has("Liability") && sectionMap.has("Equity") && (
                  <tr className="border-t border-slate-300 bg-slate-100 text-sm font-semibold">
                    <td className="px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide" colSpan={2}>
                      Total Liabilities + Equity
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {usdSigned(liabPlusEquity)}
                    </td>
                  </tr>
                )}

                {/* Balance check */}
                <tr className={`border-t-2 text-sm font-bold ${isBalanced ? "bg-slate-800 text-white" : "bg-red-700 text-white"}`}>
                  <td className="px-4 py-3" colSpan={2}>
                    {isBalanced ? "✓ Balanced" : "⚠ Out of Balance"}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${isBalanced ? "" : "text-red-200"}`}>
                    {isBalanced ? usdSigned(totalAssets) : usdSigned(balanceDiff)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

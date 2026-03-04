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

/** Plain number with 2 decimal places, no currency symbol. Matches AppFolio style. */
function fmt(n: number): string {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/* ─── Account type ordering & display ─────────────────── */

const SECTION_ORDER = ["Asset", "Liability", "Equity"];

function normaliseType(t: string): string {
  const lower = t.toLowerCase();
  if (lower.startsWith("asset"))  return "Asset";
  if (lower.startsWith("liab"))   return "Liability";
  if (lower.startsWith("equit") || lower.startsWith("capital")) return "Equity";
  return t;
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
  const projectId = searchParams.projectId ?? null;
  const asOf      = searchParams.asOf ?? today();
  const basis     = searchParams.basis === "Cash" ? "Cash" : "Accrual" as "Cash" | "Accrual";

  const supabase = createAdminClient();

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
          <ReportControls projects={projects} currentProjectId={null} currentAsOf={asOf} currentBasis={basis} />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">Select a project above to generate the report.</p>
          </div>
        </div>
      </div>
    );
  }

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
  let glRows: GlRow[] = [];
  let actualDate: string | null = null;

  if (project.appfolio_property_id) {
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

  // ── Group by normalised account_type ─────────────────
  const sectionMap = new Map<string, GlRow[]>();
  for (const row of glRows) {
    const type = normaliseType(row.account_type);
    if (!sectionMap.has(type)) sectionMap.set(type, []);
    sectionMap.get(type)!.push(row);
  }

  const knownInData   = SECTION_ORDER.filter((t) => sectionMap.has(t));
  const unknownInData = Array.from(sectionMap.keys()).filter((t) => !SECTION_ORDER.includes(t));
  const displayOrder  = [...knownInData, ...unknownInData];

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
  const hasData          = glRows.length > 0;

  // Liabilities and Equity are shown as one combined "LIABILITIES & CAPITAL" section
  const hasLiabEquity    = sectionMap.has("Liability") || sectionMap.has("Equity");

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
          <>
            {/* ── Report title block ── */}
            <div className="mb-4 text-center" style={{ maxWidth: 760 }}>
              <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                {project.name}
              </p>
              <p className="text-base font-bold text-slate-900 mt-0.5">Balance Sheet</p>
              {displayDate && (
                <p className="text-sm text-slate-600 mt-0.5">As of {displayDate} &middot; {basis} Basis</p>
              )}
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto rounded border border-slate-200" style={{ maxWidth: 760 }}>
              <table className="w-full text-sm border-collapse">

                {/* Column header */}
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">
                      Account Number
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Account Name
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">
                      Balance
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {displayOrder.map((type) => {
                    const rows        = sectionMap.get(type) ?? [];
                    const sectionTotal = sectionTotals.get(type) ?? 0;

                    // "Liability" and "Equity" are merged under LIABILITIES & CAPITAL.
                    // Render the big section header only once — before Liability rows.
                    const isLiab  = type === "Liability";
                    const isEquity = type === "Equity";
                    const showLiabCapHeader = isLiab || (isEquity && !sectionMap.has("Liability"));

                    // Sub-section label for the individual type subtotal
                    const subLabel =
                      type === "Asset"     ? "Assets" :
                      type === "Liability" ? "Liabilities" :
                      type === "Equity"    ? "Capital" : type;

                    return (
                      <Fragment key={type}>

                        {/* ── Big section header ── */}
                        {type === "Asset" && (
                          <SectionHeader label="ASSETS" />
                        )}
                        {showLiabCapHeader && (
                          <SectionHeader label="LIABILITIES & CAPITAL" />
                        )}
                        {!["Asset", "Liability", "Equity"].includes(type) && (
                          <SectionHeader label={type.toUpperCase()} />
                        )}

                        {/* ── Account rows ── */}
                        {rows.map((row) => (
                          <tr key={row.gl_account_id} className="border-t border-slate-100 hover:bg-slate-50/40">
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-400 align-top pt-2">
                              {row.gl_account_number ?? ""}
                            </td>
                            <td className="px-3 py-1.5 text-blue-600">
                              &nbsp;&nbsp;{row.gl_account_name}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                              {fmt(Number(row.balance))}
                            </td>
                          </tr>
                        ))}

                        {/* ── Sub-section subtotal ── */}
                        <tr className="border-t border-slate-200">
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 font-semibold text-slate-700">
                            Total {subLabel}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800 border-t-2 border-t-slate-400">
                            {fmt(sectionTotal)}
                          </td>
                        </tr>

                        {/* ── TOTAL ASSETS grand total (after Asset section) ── */}
                        {type === "Asset" && (
                          <GrandTotal label="TOTAL ASSETS" value={totalAssets} />
                        )}

                        {/* ── TOTAL LIABILITIES & CAPITAL grand total (after Equity, or after Liability if no Equity) ── */}
                        {(isEquity || (isLiab && !sectionMap.has("Equity"))) && hasLiabEquity && (
                          <GrandTotal label="TOTAL LIABILITIES & CAPITAL" value={liabPlusEquity} />
                        )}

                      </Fragment>
                    );
                  })}
                </tbody>

                {/* ── Balance check footer ── */}
                <tfoot>
                  <tr className={`border-t-2 ${isBalanced ? "border-slate-300" : "border-red-400"}`}>
                    <td className="px-3 py-2" />
                    <td className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${isBalanced ? "text-slate-400" : "text-red-600"}`}>
                      {isBalanced ? "In Balance" : "⚠ Out of Balance"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-xs ${isBalanced ? "text-slate-400" : "text-red-600 font-semibold"}`}>
                      {isBalanced ? "" : fmt(balanceDiff)}
                    </td>
                  </tr>
                </tfoot>

              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-slate-100 border-t border-b border-slate-300">
      <td className="px-3 py-1.5" />
      <td className="px-3 py-1.5 font-bold text-slate-800 text-xs uppercase tracking-wide" colSpan={2}>
        {label}
      </td>
    </tr>
  );
}

function GrandTotal({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-t-2 border-slate-400 border-b border-slate-300">
      <td className="px-3 py-1.5" />
      <td className="px-3 py-1.5 font-bold text-slate-900 text-xs uppercase tracking-wide">
        {label}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900 border-t-2 border-slate-700">
        {fmt(value)}
      </td>
    </tr>
  );
}

export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { HELP } from "@/lib/help";
import { ReportControls } from "./report-controls";
import { ExportButton, type TbRow } from "./export-button";

/* ─── Helpers ─────────────────────────────────────────── */

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): string {
  return localDateStr(new Date());
}

function appfolioDateCap(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Types ───────────────────────────────────────────── */

interface RawTx {
  id: string;
  appfolio_property_id: string;
  gl_account_id: string;
  gl_account_name: string;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
}

interface RawGlBalance {
  gl_account_id: string;
  gl_account_name: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: Promise<{
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    run?: string;
  }>;
}

export default async function TrialBalancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const projectId = sp.projectId ?? null;
  const dateFrom = sp.dateFrom ?? null;
  const dateTo = sp.dateTo ?? today();

  const supabase = createAdminClient();

  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .order("name");

  const projects = (allProjects ?? []) as ProjectInfo[];

  const hasRunParam =
    sp.projectId !== undefined ||
    sp.dateFrom !== undefined ||
    sp.dateTo !== undefined ||
    sp.run !== undefined;

  /* ── Empty state ──────────────────────────────────── */
  if (!hasRunParam) {
    return (
      <div>
        <Header title="Trial Balance" helpContent={HELP.trialBalance} />
        <div className="p-4 sm:p-6">
          <ReportControls
            projects={projects}
            currentProjectId={null}
            currentDateFrom={null}
            currentDateTo={null}
          />
          <div className="rounded-lg border border-dashed p-16 text-center mt-4">
            <p className="text-muted-foreground text-sm">
              Select a project above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Resolve selected project ─────────────────────── */
  const selectedProject = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
  const linkedPropertyIds = selectedProject?.appfolio_property_id
    ? [selectedProject.appfolio_property_id]
    : [];

  let transactions: RawTx[] = [];
  let knownGlAccounts: RawGlBalance[] = [];

  if (linkedPropertyIds.length > 0) {
    const effectiveDateTo = dateTo < appfolioDateCap() ? dateTo : appfolioDateCap();

    let query = supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_property_id, gl_account_id, gl_account_name, " +
        "invoice_amount, paid_amount, unpaid_amount"
      )
      .in("appfolio_property_id", linkedPropertyIds)
      .lte("bill_date", effectiveDateTo)
      .order("gl_account_id", { ascending: true });

    if (dateFrom) {
      query = query.gte("bill_date", dateFrom);
    }

    const [{ data: rawTx }, { data: rawGl }] = await Promise.all([
      query,
      supabase
        .from("gl_balances")
        .select("gl_account_id, gl_account_name")
        .in("appfolio_property_id", linkedPropertyIds)
        .lte("as_of_date", effectiveDateTo),
    ]);

    transactions = (rawTx ?? []) as RawTx[];
    knownGlAccounts = (rawGl ?? []) as RawGlBalance[];
  }

  /* ── Aggregate by GL account ──────────────────────── */
  type GlSummary = {
    glAccountId: string;
    glAccountName: string;
    debit: number;   // invoice_amount total
    credit: number;  // paid_amount total
    netBalance: number; // debit - credit (positive = DR, negative = CR)
  };

  const glMap = new Map<string, GlSummary>();
  for (const tx of transactions) {
    const key = `${tx.gl_account_id}||${tx.gl_account_name}`;
    if (!glMap.has(key)) {
      glMap.set(key, {
        glAccountId: tx.gl_account_id,
        glAccountName: tx.gl_account_name,
        debit: 0,
        credit: 0,
        netBalance: 0,
      });
    }
    const row = glMap.get(key)!;
    row.debit += Number(tx.invoice_amount);
    row.credit += Number(tx.paid_amount);
    row.netBalance += Number(tx.invoice_amount) - Number(tx.paid_amount);
  }

  // Seed the map with all known GL accounts from gl_balances (ensures $0 rows appear)
  for (const gl of knownGlAccounts) {
    const key = `${gl.gl_account_id}||${gl.gl_account_name}`;
    if (!glMap.has(key)) {
      glMap.set(key, {
        glAccountId: gl.gl_account_id,
        glAccountName: gl.gl_account_name,
        debit: 0,
        credit: 0,
        netBalance: 0,
      });
    }
  }

  const glRows = [...glMap.values()].sort((a, b) =>
    a.glAccountId.localeCompare(b.glAccountId)
  );

  /* ── Grand totals ─────────────────────────────────── */
  const grandDebit = glRows.reduce((s, r) => s + r.debit, 0);
  const grandCredit = glRows.reduce((s, r) => s + r.credit, 0);
  const grandNetBalance = glRows.reduce((s, r) => s + r.netBalance, 0);

  // Debit = Credit + NetBalance — data integrity check
  const isBalanced = Math.abs(grandDebit - grandCredit - grandNetBalance) < 0.01;

  /* ── Export rows (one per GL account) ─────────────── */
  const exportRows: TbRow[] = glRows.map((r) => ({
    glAccountId: r.glAccountId,
    glAccountName: r.glAccountName,
    debit: r.debit,
    credit: r.credit,
    balance: r.netBalance,
  }));

  /* ── Labels ───────────────────────────────────────── */
  const projectLabel = selectedProject
    ? `${selectedProject.code} — ${selectedProject.name}`
    : "All Projects";

  const dateLabel = dateFrom
    ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
    : `Through ${fmtDate(dateTo)}`;

  return (
    <div>
      <Header title="Trial Balance" helpContent={HELP.trialBalance} />
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            currentProjectId={projectId}
            currentDateFrom={dateFrom}
            currentDateTo={dateTo}
          />
        </div>

        {/* Report header */}
        <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3 mt-4">
          <div className="print-header">
            <h2 className="text-xl font-bold tracking-tight">Trial Balance</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              {dateLabel}
              &nbsp;·&nbsp;
              {glRows.length} GL account{glRows.length !== 1 ? "s" : ""}
            </p>
          </div>
          {glRows.length > 0 && (
            <div className="shrink-0 print:hidden">
              <ExportButton
                rows={exportRows}
                projectLabel={projectLabel}
                dateLabel={dateLabel}
              />
            </div>
          )}
        </div>

        {!selectedProject && projectId && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">Project not found. Please select a valid project.</p>
          </div>
        )}

        {selectedProject && !selectedProject.appfolio_property_id && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 mb-4">
            This project has no AppFolio property linked — transaction data is not available.
          </div>
        )}

        {glRows.length === 0 && (selectedProject?.appfolio_property_id || !projectId) ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">No transactions found for the selected filters.</p>
          </div>
        ) : glRows.length > 0 ? (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 12mm 10mm; }
                table { font-size: 8pt !important; width: 100% !important; }
                th, td { padding: 2pt 4pt !important; }
              }
            `}</style>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">GL Account</th>
                    <th className="px-3 py-2.5 text-left font-medium">Account Name</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Debit</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Credit</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Net Balance</th>
                    <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">DR / CR</th>
                  </tr>
                </thead>
                <tbody>
                  {glRows.map((row) => {
                    const isDebit = row.netBalance >= 0;
                    return (
                      <tr
                        key={row.glAccountId}
                        className="border-t border-slate-100 hover:bg-slate-50/50 bg-white"
                      >
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{row.glAccountId}</td>
                        <td className="px-3 py-2">{row.glAccountName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(row.debit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-700">{usd(row.credit)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${!isDebit ? "text-blue-700" : row.netBalance > 0 ? "text-amber-700" : ""}`}>
                          {usd(row.netBalance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${isDebit ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                            {isDebit ? "DR" : "CR"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold">
                    <td className="px-3 py-3" colSpan={2}>
                      <div className="flex items-center gap-3">
                        <span>TOTAL — {glRows.length} account{glRows.length !== 1 ? "s" : ""}</span>
                        <span
                          title={isBalanced ? "Debits = Credits + Net Balance" : "Debits ≠ Credits + Net Balance — data may be inconsistent"}
                          className={`text-xs font-normal px-2 py-0.5 rounded-full ${isBalanced ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}
                        >
                          {isBalanced ? "✓ Balanced" : "✗ Out of Balance"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandDebit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandCredit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandNetBalance)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${grandNetBalance >= 0 ? "bg-amber-500 text-white" : "bg-blue-500 text-white"}`}>
                        {grandNetBalance >= 0 ? "DR" : "CR"}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

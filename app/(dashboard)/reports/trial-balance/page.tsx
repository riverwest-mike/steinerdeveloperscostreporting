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
  }).format(n);
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

interface ProjectInfo {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: Promise<{
    projectIds?: string;
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    run?: string;
  }>;
}

export default async function TrialBalancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawIds = sp.projectIds ?? sp.projectId ?? null;
  const projectIds = rawIds ? rawIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const dateFrom = sp.dateFrom ?? null;
  const dateTo = sp.dateTo ?? today();

  const supabase = createAdminClient();

  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .order("name");

  const projects = (allProjects ?? []) as ProjectInfo[];

  const hasRunParam =
    sp.projectIds !== undefined ||
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
            currentProjectIds={[]}
            currentDateFrom={null}
            currentDateTo={null}
          />
          <div className="rounded-lg border border-dashed p-16 text-center mt-4">
            <p className="text-muted-foreground text-sm">
              Select filters above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Resolve property IDs ─────────────────────────── */
  const selectedProjects = projectIds.length > 0
    ? projects.filter((p) => projectIds.includes(p.id))
    : projects;

  const linkedPropertyIds = selectedProjects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  let transactions: RawTx[] = [];

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

    const { data: rawTx } = await query;
    transactions = (rawTx ?? []) as RawTx[];
  }

  /* ── Build project lookup ──────────────────────────── */
  const propertyToProject = new Map<string, ProjectInfo>();
  for (const p of projects) {
    if (p.appfolio_property_id) propertyToProject.set(p.appfolio_property_id, p);
  }

  /* ── Aggregate by GL account ──────────────────────── */
  type GlSummary = {
    glAccountId: string;
    glAccountName: string;
    debit: number;   // invoice_amount total
    credit: number;  // paid_amount total
    balance: number; // unpaid_amount total
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
        balance: 0,
      });
    }
    const row = glMap.get(key)!;
    row.debit += Number(tx.invoice_amount);
    row.credit += Number(tx.paid_amount);
    row.balance += Number(tx.unpaid_amount);
  }

  const glRows = [...glMap.values()].sort((a, b) =>
    a.glAccountId.localeCompare(b.glAccountId)
  );

  /* ── Grand totals ─────────────────────────────────── */
  const grandDebit = glRows.reduce((s, r) => s + r.debit, 0);
  const grandCredit = glRows.reduce((s, r) => s + r.credit, 0);
  const grandBalance = glRows.reduce((s, r) => s + r.balance, 0);

  /* ── Export rows (one per GL account) ─────────────── */
  const exportRows: TbRow[] = glRows.map((r) => ({
    glAccountId: r.glAccountId,
    glAccountName: r.glAccountName,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
  }));

  /* ── Labels ───────────────────────────────────────── */
  const projectLabel = selectedProjects.length === projects.length
    ? "All Projects"
    : selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : selectedProjects.map((p) => p.code).join(", ") + ` (${selectedProjects.length} projects)`;

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
            currentProjectIds={projectIds}
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

        {glRows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">No transactions found for the selected filters.</p>
          </div>
        ) : (
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
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {glRows.map((row) => (
                    <tr
                      key={row.glAccountId}
                      className="border-t border-slate-100 hover:bg-slate-50/50 bg-white"
                    >
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{row.glAccountId}</td>
                      <td className="px-3 py-2">{row.glAccountName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(row.debit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-700">{usd(row.credit)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${row.balance > 0 ? "text-amber-700" : ""}`}>
                        {usd(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold">
                    <td className="px-3 py-3" colSpan={2}>
                      TOTAL — {glRows.length} account{glRows.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandDebit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandCredit)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandBalance)}</td>
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

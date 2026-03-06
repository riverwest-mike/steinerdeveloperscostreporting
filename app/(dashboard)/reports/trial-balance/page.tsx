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
  appfolio_bill_id: string;
  vendor_name: string;
  gl_account_id: string;
  gl_account_name: string;
  bill_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  description: string | null;
  reference_number: string | null;
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
    projectId?: string; // legacy single-project support
    dateFrom?: string;
    dateTo?: string;
    run?: string;
  }>;
}

export default async function TrialBalancePage({ searchParams }: Props) {
  const sp = await searchParams;
  // Support new ?projectIds=id1,id2 and legacy ?projectId=id
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
        "id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
        "bill_date, invoice_amount, paid_amount, unpaid_amount, description, reference_number"
      )
      .in("appfolio_property_id", linkedPropertyIds)
      .lte("bill_date", effectiveDateTo)
      .order("gl_account_id", { ascending: true })
      .order("bill_date", { ascending: true });

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

  /* ── Group by GL account ──────────────────────────── */
  type GroupKey = string; // gl_account_id||gl_account_name
  const groupMap = new Map<GroupKey, RawTx[]>();
  for (const tx of transactions) {
    const key = `${tx.gl_account_id}||${tx.gl_account_name}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(tx);
  }
  const groups = [...groupMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  /* ── Build export rows ────────────────────────────── */
  const exportRows: TbRow[] = transactions.map((tx) => ({
    glAccountId: tx.gl_account_id,
    glAccountName: tx.gl_account_name,
    billDate: tx.bill_date,
    vendorName: tx.vendor_name,
    description: tx.description,
    referenceNumber: tx.reference_number,
    invoiceAmount: Number(tx.invoice_amount),
    paidAmount: Number(tx.paid_amount),
    unpaidAmount: Number(tx.unpaid_amount),
    projectCode: propertyToProject.get(tx.appfolio_property_id)?.code ?? tx.appfolio_property_id,
  }));

  /* ── Grand totals ─────────────────────────────────── */
  const grandInvoice = transactions.reduce((s, t) => s + Number(t.invoice_amount), 0);
  const grandPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
  const grandUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);

  /* ── Labels ───────────────────────────────────────── */
  const projectLabel = selectedProjects.length === projects.length
    ? "All Projects"
    : selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : selectedProjects.map((p) => p.code).join(", ") + ` (${selectedProjects.length} projects)`;

  const dateLabel = dateFrom
    ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
    : `Through ${fmtDate(dateTo)}`;

  const showProjectCol = projectIds.length !== 1;

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
              {groups.length} GL account{groups.length !== 1 ? "s" : ""}
              &nbsp;·&nbsp;
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
            </p>
          </div>
          {transactions.length > 0 && (
            <div className="shrink-0 print:hidden">
              <ExportButton
                rows={exportRows}
                projectLabel={projectLabel}
                dateLabel={dateLabel}
              />
            </div>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">No transactions found for the selected filters.</p>
          </div>
        ) : (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 0; }
                table { font-size: 7pt !important; width: 100% !important; }
                th, td { padding: 1pt 3pt !important; }
                .tb-group-header { background: #1e293b !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            `}</style>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">GL Account</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Account Name</th>
                    {showProjectCol && (
                      <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>
                    )}
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Date</th>
                    <th className="px-3 py-2.5 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2.5 text-left font-medium">Description</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Invoice</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Paid</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([key, txns]) => {
                    const [acctId, acctName] = key.split("||");
                    const groupInvoice = txns.reduce((s, t) => s + Number(t.invoice_amount), 0);
                    const groupPaid = txns.reduce((s, t) => s + Number(t.paid_amount), 0);
                    const groupUnpaid = txns.reduce((s, t) => s + Number(t.unpaid_amount), 0);

                    return (
                      <>
                        {/* GL Account header row */}
                        <tr key={`hdr-${key}`} className="tb-group-header bg-slate-700 text-white">
                          <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{acctId}</td>
                          <td className="px-3 py-2 font-semibold" colSpan={showProjectCol ? 5 : 4}>{acctName}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{usd(groupInvoice)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{usd(groupPaid)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{usd(groupUnpaid)}</td>
                        </tr>

                        {/* Transaction rows */}
                        {txns.map((tx) => {
                          const proj = propertyToProject.get(tx.appfolio_property_id);
                          return (
                            <tr
                              key={tx.id}
                              className="border-t border-slate-100 hover:bg-slate-50/50 bg-white"
                            >
                              <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap pl-6">{tx.gl_account_id}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{tx.gl_account_name}</td>
                              {showProjectCol && (
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  <span className="font-mono text-[10px] text-primary">{proj?.code ?? "—"}</span>
                                </td>
                              )}
                              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-muted-foreground">
                                {fmtDate(tx.bill_date)}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">{tx.vendor_name}</td>
                              <td className="px-3 py-1.5 max-w-[240px]">
                                <p className="truncate text-muted-foreground">{tx.description ?? "—"}</p>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{usd(Number(tx.invoice_amount))}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-green-700">{usd(Number(tx.paid_amount))}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-amber-700">{usd(Number(tx.unpaid_amount))}</td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold">
                    <td className="px-3 py-3" colSpan={showProjectCol ? 6 : 5}>
                      GRAND TOTAL — {groups.length} account{groups.length !== 1 ? "s" : ""}, {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandInvoice)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandPaid)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(grandUnpaid)}</td>
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

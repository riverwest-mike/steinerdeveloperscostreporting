export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";
import { ExportButtons } from "./export-buttons";
import { TransactionNoteCell } from "@/components/transaction-note-cell";
import { TransactionGateCell } from "@/components/transaction-gate-cell";
import { ColumnPicker } from "@/components/column-picker";
import { HELP } from "@/lib/help";

const GATE_DETAIL_COLUMNS = [
  { key: "project", label: "Project" },
  { key: "gate", label: "Gate", required: true },
  { key: "bill_date", label: "Bill Date" },
  { key: "vendor", label: "Vendor", required: true },
  { key: "description", label: "Description" },
  { key: "gl_account", label: "GL Account" },
  { key: "cost_category", label: "Cost Category" },
  { key: "invoice_amt", label: "Invoice Amt", required: true },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "status", label: "Status" },
  { key: "check_num", label: "Check #" },
  { key: "reference", label: "Reference" },
  { key: "notes", label: "Notes" },
];

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

interface Transaction {
  id: string;
  appfolio_property_id: string;
  appfolio_bill_id: string;
  vendor_name: string;
  gl_account_id: string;
  gl_account_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  bill_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  check_number: string | null;
  reference_number: string | null;
  description: string | null;
}

interface GateInfo {
  id: string;
  project_id: string;
  name: string;
  sequence_number: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: {
    projectId?: string;
    projectIds?: string; // legacy — treat first as single
    gateId?: string;
    categoryCode?: string;
    asOf?: string;
    paymentFilter?: string;
  };
}

export default async function GateDetailPage({ searchParams }: Props) {
  // Accept single projectId; also handle legacy multi-select (use first id)
  const rawProjectId = searchParams.projectId
    ?? (searchParams.projectIds ? searchParams.projectIds.split(",")[0] : undefined)
    ?? null;
  const projectIds = rawProjectId ? [rawProjectId] : [];
  const filterGateId = searchParams.gateId ?? null;
  const categoryCode = searchParams.categoryCode ?? null;
  const asOf = searchParams.asOf ?? today();
  const paymentFilter = searchParams.paymentFilter ?? null;

  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");
  const { data: currentUser } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (currentUser as { role?: string } | null)?.role;
  const isAdmin = role === "admin";
  const canEditGate = role === "admin" || role === "project_manager";

  // Load all projects and categories for controls
  const [{ data: allProjects }, { data: rawCategories }] = await Promise.all([
    supabase.from("projects").select("id, name, code, appfolio_property_id").order("name"),
    supabase.from("cost_categories").select("id, name, code").eq("is_active", true).order("display_order"),
  ]);

  const projects = (allProjects ?? []) as ProjectInfo[];
  const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

  // Load all gates grouped by project (for filter dropdown)
  const { data: allGatesRaw } = await supabase
    .from("gates")
    .select("id, project_id, name, sequence_number")
    .order("sequence_number", { ascending: true });

  const allGates = (allGatesRaw ?? []) as GateInfo[];
  const gatesByProjectId: Record<string, GateInfo[]> = {};
  const gateNameById = new Map<string, { name: string; sequence_number: number }>();

  for (const g of allGates) {
    if (!gatesByProjectId[g.project_id]) gatesByProjectId[g.project_id] = [];
    gatesByProjectId[g.project_id].push(g);
    gateNameById.set(g.id, { name: g.name, sequence_number: g.sequence_number });
  }

  // ── No project selected ───────────────────────────────
  if (projectIds.length === 0) {
    return (
      <div>
        <Header title="Gate Detail Report" helpContent={HELP.gateDetailReport} />
        <div className="p-4 sm:p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            gatesByProjectId={gatesByProjectId}
            currentProjectId={null}
            currentGateId={null}
            currentCategoryCode={null}
            currentAsOf={asOf}
            currentPaymentFilter={null}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              Select one or more projects above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Resolve projects ──────────────────────────────────
  const selectedProjects = projects.filter((p) => projectIds.includes(p.id));
  const linkedPropertyIds = selectedProjects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  const propertyToProject = new Map<string, ProjectInfo>(
    projects.filter((p) => p.appfolio_property_id).map((p) => [p.appfolio_property_id!, p])
  );

  // ── Fetch gate assignments for selected projects/gate ─
  // We need: transactions that are assigned to gates belonging to these projects.
  // If filterGateId is set, only fetch that gate's assignments.
  const relevantGateIds = filterGateId
    ? [filterGateId]
    : allGates.filter((g) => projectIds.includes(g.project_id)).map((g) => g.id);

  let transactions: Transaction[] = [];

  if (linkedPropertyIds.length > 0 && relevantGateIds.length > 0) {
    // Get transaction IDs that are assigned to the relevant gates
    const { data: gateAssignments } = await supabase
      .from("transaction_gate_assignments")
      .select("appfolio_transaction_id, gate_id, is_override")
      .in("gate_id", relevantGateIds);

    const assignedTxIds = (gateAssignments ?? []).map(
      (ga: { appfolio_transaction_id: string }) => ga.appfolio_transaction_id
    );

    if (assignedTxIds.length > 0) {
      // Build gate assignment lookup
      type GateAssignment = { appfolio_transaction_id: string; gate_id: string; is_override: boolean };
      const gateAssignmentByTxId = new Map<string, GateAssignment>();
      for (const ga of (gateAssignments ?? []) as GateAssignment[]) {
        gateAssignmentByTxId.set(ga.appfolio_transaction_id, ga);
      }

      // Fetch the actual transactions (only those in our property set + assigned)
      let txQuery = supabase
        .from("appfolio_transactions")
        .select(
          "id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
          "cost_category_code, cost_category_name, bill_date, " +
          "invoice_amount, paid_amount, unpaid_amount, payment_status, " +
          "check_number, reference_number, description"
        )
        .in("id", assignedTxIds)
        .in("appfolio_property_id", linkedPropertyIds)
        .lte("bill_date", asOf < appfolioDateCap() ? asOf : appfolioDateCap());

      if (categoryCode) {
        txQuery = txQuery.ilike("cost_category_code", categoryCode);
      }

      if (paymentFilter === "paid") {
        txQuery = txQuery.gt("paid_amount", 0);
      } else if (paymentFilter === "unpaid") {
        txQuery = txQuery.gt("unpaid_amount", 0);
      }

      const { data: rawTx } = await txQuery.order("bill_date", { ascending: false });
      const rawTransactions = (rawTx ?? []) as Transaction[];

      // Attach gate assignment info to each transaction for rendering
      transactions = rawTransactions;

      // Store gate assignments for use in rendering
      // We'll use a closure-style approach by annotating the page-level map
      // (passed to render below)
      const gateAssignmentMap = gateAssignmentByTxId;

      // Fetch notes
      const billIds = transactions.map((t) => t.appfolio_bill_id);
      const notesByBillId = new Map<string, string>();
      if (billIds.length > 0) {
        const { data: rawNotes } = await supabase
          .from("transaction_notes")
          .select("appfolio_bill_id, note")
          .in("appfolio_bill_id", billIds);
        for (const n of (rawNotes ?? []) as { appfolio_bill_id: string; note: string }[]) {
          notesByBillId.set(n.appfolio_bill_id, n.note);
        }
      }

      // AppFolio base URL
      const appfolioBaseUrl = process.env.APPFOLIO_DATABASE_URL
        ? `https://${process.env.APPFOLIO_DATABASE_URL}`
        : null;

      // ── Totals ────────────────────────────────────────
      const totalInvoice = transactions.reduce((s, t) => s + Number(t.invoice_amount), 0);
      const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
      const totalUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);

      // Labels (single project only)
      const showProjectCol = false;

      const projectLabel = selectedProjects.length === 1
        ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
        : "Unknown Project";

      const filterGateInfo = filterGateId ? gateNameById.get(filterGateId) : null;
      const gateLabel = filterGateInfo
        ? `Gate ${filterGateInfo.sequence_number} — ${filterGateInfo.name}`
        : "All Gates";

      const selectedCategory = categoryCode
        ? categories.find((c) => c.code.toUpperCase() === categoryCode.toUpperCase())
        : null;
      const categoryLabel = selectedCategory
        ? `${selectedCategory.code} — ${selectedCategory.name}`
        : categoryCode ?? "All Categories";

      const reportLabel = `${projectLabel} · ${gateLabel}`;

      // Build enriched transactions for export
      const txWithGate = transactions.map((tx) => {
        const ga = gateAssignmentMap.get(tx.id);
        const gateData = ga ? gateNameById.get(ga.gate_id) : null;
        const txProject = propertyToProject.get(tx.appfolio_property_id);
        return {
          ...tx,
          gate_name: gateData ? `Gate ${gateData.sequence_number} — ${gateData.name}` : "",
          project_code: txProject?.code ?? "",
          project_name: txProject?.name ?? "",
        };
      });

      const projectGatesByProjectId = new Map<string, GateInfo[]>();
      for (const [pid, gates] of Object.entries(gatesByProjectId)) {
        projectGatesByProjectId.set(pid, gates);
      }

      return (
        <div>
          <Header title="Gate Detail Report" helpContent={HELP.gateDetailReport} />
          <div className="p-4 sm:p-6">
            <div className="print:hidden">
              <ReportControls
                projects={projects}
                categories={categories}
                gatesByProjectId={gatesByProjectId}
                currentProjectId={rawProjectId}
                currentGateId={filterGateId}
                currentCategoryCode={categoryCode}
                currentAsOf={asOf}
                currentPaymentFilter={paymentFilter}
              />
            </div>

            {/* Report header */}
            <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3">
              <div className="print-header">
                <h2 className="text-xl font-bold tracking-tight">Gate Detail Report</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {projectLabel}
                  &nbsp;·&nbsp;
                  <span className="font-medium text-foreground">{gateLabel}</span>
                  &nbsp;·&nbsp;
                  {categoryLabel}
                  {paymentFilter === "paid" && (
                    <span className="ml-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                      Paid Only
                    </span>
                  )}
                  {paymentFilter === "unpaid" && (
                    <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Unpaid Only
                    </span>
                  )}
                  &nbsp;·&nbsp; As of{" "}
                  {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 print:hidden">
                <ColumnPicker
                  columns={GATE_DETAIL_COLUMNS}
                  storageKey="cols_gate_detail"
                />
                {transactions.length > 0 && (
                  <ExportButtons
                    transactions={txWithGate}
                    reportLabel={reportLabel}
                    asOf={asOf}
                  />
                )}
              </div>
            </div>

            {transactions.length === 0 && (
              <div className="rounded-lg border border-dashed p-12 text-center">
                <p className="text-muted-foreground text-sm">
                  No transactions found for the selected gate{categoryCode ? ` and cost category "${categoryCode}"` : ""} as of{" "}
                  {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  .
                </p>
              </div>
            )}

            {transactions.length > 0 && (
              <>
              <style>{`
                @media print {
                  @page { size: landscape; margin: 10mm 8mm; }
                  .overflow-x-auto { overflow: visible !important; }
                  table { font-size: 7pt !important; min-width: 0 !important; width: 100% !important; table-layout: fixed; }
                  th, td { padding: 1pt 3pt !important; white-space: normal !important; word-break: break-word; overflow: hidden; }
                  th[data-col="description"], td[data-col="description"] { width: 18%; }
                  th[data-col="vendor"], td[data-col="vendor"] { width: 16%; }
                  th[data-col="notes"], td[data-col="notes"] { width: 14%; }
                }
              `}</style>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {showProjectCol && <th data-col="project" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>}
                      <th data-col="gate" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Gate</th>
                      <th data-col="bill_date" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Bill Date</th>
                      <th data-col="vendor" className="px-3 py-2.5 text-left font-medium">Vendor</th>
                      <th data-col="description" className="px-3 py-2.5 text-left font-medium">Description</th>
                      <th data-col="gl_account" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">GL Account</th>
                      <th data-col="cost_category" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Cost Category</th>
                      <th data-col="invoice_amt" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Invoice Amt</th>
                      <th data-col="paid" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Paid</th>
                      <th data-col="unpaid" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Unpaid</th>
                      <th data-col="status" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Status</th>
                      <th data-col="check_num" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Check #</th>
                      <th data-col="reference" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Reference</th>
                      <th data-col="notes" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const ga = gateAssignmentMap.get(tx.id);
                      const gateData = ga ? gateNameById.get(ga.gate_id) : null;
                      const txProject = propertyToProject.get(tx.appfolio_property_id);
                      const projectGates = txProject
                        ? (projectGatesByProjectId.get(txProject.id) ?? [])
                        : [];

                      return (
                        <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                          {showProjectCol && (
                            <td data-col="project" className="px-3 py-2 whitespace-nowrap">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {txProject?.code ?? "—"}
                              </span>
                            </td>
                          )}
                          <td data-col="gate" className="px-3 py-2">
                            <TransactionGateCell
                              transactionId={tx.id}
                              currentGateId={ga?.gate_id ?? null}
                              currentGateName={gateData?.name ?? null}
                              currentGateSequence={gateData?.sequence_number ?? null}
                              isOverride={ga?.is_override ?? false}
                              projectGates={projectGates}
                              canEdit={canEditGate}
                            />
                          </td>
                          <td data-col="bill_date" className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                            {fmtDate(tx.bill_date)}
                          </td>
                          <td data-col="vendor" className="px-3 py-2 font-medium">{tx.vendor_name}</td>
                          <td data-col="description" className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                            {tx.description ?? "—"}
                          </td>
                          <td data-col="gl_account" className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            <span className="font-mono">{tx.gl_account_id || "—"}</span>
                            {tx.gl_account_name && (
                              <span className="ml-1 text-[10px]">{tx.gl_account_name}</span>
                            )}
                          </td>
                          <td data-col="cost_category" className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            <span className="font-mono">{tx.cost_category_code ?? "—"}</span>
                            {tx.cost_category_name && (
                              <span className="ml-1 text-[10px]">{tx.cost_category_name}</span>
                            )}
                          </td>
                          <td data-col="invoice_amt" className="px-3 py-2 text-right tabular-nums font-medium">
                            {appfolioBaseUrl ? (
                              <a
                                href={`${appfolioBaseUrl}/payable_bills/${tx.appfolio_bill_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                                title="Open in AppFolio"
                              >
                                {usd(Number(tx.invoice_amount))}
                              </a>
                            ) : usd(Number(tx.invoice_amount))}
                          </td>
                          <td data-col="paid" className="px-3 py-2 text-right tabular-nums text-green-700">
                            {usd(Number(tx.paid_amount))}
                          </td>
                          <td data-col="unpaid" className="px-3 py-2 text-right tabular-nums text-amber-700">
                            {Number(tx.unpaid_amount) !== 0 ? usd(Number(tx.unpaid_amount)) : "—"}
                          </td>
                          <td data-col="status" className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                /^paid$/i.test(tx.payment_status)
                                  ? "bg-green-100 text-green-800"
                                  : /^unpaid$/i.test(tx.payment_status)
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {tx.payment_status}
                            </span>
                          </td>
                          <td data-col="check_num" className="px-3 py-2 text-muted-foreground">{tx.check_number ?? "—"}</td>
                          <td data-col="reference" className="px-3 py-2 text-muted-foreground">{tx.reference_number ?? "—"}</td>
                          <td data-col="notes" className="px-3 py-2">
                            <TransactionNoteCell
                              appfolioBillId={tx.appfolio_bill_id}
                              initialNote={notesByBillId.get(tx.appfolio_bill_id) ?? null}
                              isAdmin={isAdmin}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
                      {showProjectCol && <td data-col="project" className="px-3 py-3" />}
                      <td data-col="gate" className="px-3 py-3" />
                      <td data-col="bill_date" className="px-3 py-3" />
                      <td data-col="vendor" className="px-3 py-3">
                        TOTAL — {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                      </td>
                      <td data-col="description" className="px-3 py-3" />
                      <td data-col="gl_account" className="px-3 py-3" />
                      <td data-col="cost_category" className="px-3 py-3" />
                      <td data-col="invoice_amt" className="px-3 py-3 text-right tabular-nums">{usd(totalInvoice)}</td>
                      <td data-col="paid" className="px-3 py-3 text-right tabular-nums">{usd(totalPaid)}</td>
                      <td data-col="unpaid" className="px-3 py-3 text-right tabular-nums">{totalUnpaid !== 0 ? usd(totalUnpaid) : "—"}</td>
                      <td data-col="status" className="px-3 py-3" />
                      <td data-col="check_num" className="px-3 py-3" />
                      <td data-col="reference" className="px-3 py-3" />
                      <td data-col="notes" className="px-3 py-3" />
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
  }

  // ── No gate assignments found (or no AppFolio link) ───
  const noAppFolioLink = linkedPropertyIds.length === 0;
  const filterGateInfo = filterGateId ? gateNameById.get(filterGateId) : null;
  const gateLabel = filterGateInfo
    ? `Gate ${filterGateInfo.sequence_number} — ${filterGateInfo.name}`
    : "All Gates";
  const projectLabel = selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : `${selectedProjects.length} Projects`;

  return (
    <div>
      <Header title="Gate Detail Report" helpContent={HELP.gateDetailReport} />
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            categories={categories}
            gatesByProjectId={gatesByProjectId}
            currentProjectId={rawProjectId}
            currentGateId={filterGateId}
            currentCategoryCode={categoryCode}
            currentAsOf={asOf}
            currentPaymentFilter={paymentFilter}
          />
        </div>
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight">Gate Detail Report</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projectLabel} &nbsp;·&nbsp; <span className="font-medium text-foreground">{gateLabel}</span>
          </p>
        </div>
        {noAppFolioLink ? (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            {selectedProjects.length === 1
              ? "This project is not linked to an AppFolio property"
              : "None of the selected projects are linked to AppFolio properties"}{" "}
            — no transaction data available.
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No transactions have been assigned to {filterGateId ? "this gate" : "any gate"} yet.
              Transactions are assigned automatically during sync when the bill date falls within a gate&apos;s date window.
              You can also assign transactions manually using the pencil icon in the Gate column on the Cost Detail or Vendor Detail reports.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

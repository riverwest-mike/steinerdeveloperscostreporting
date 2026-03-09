export const dynamic = "force-dynamic";

import Link from "next/link";
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

const VENDOR_DETAIL_COLUMNS = [
  { key: "project", label: "Project" },
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
  { key: "gate", label: "Gate" },
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

interface VendorTransaction {
  id: string;
  appfolio_property_id: string;
  appfolio_bill_id: string;
  vendor_name: string;
  gl_account_id: string;
  gl_account_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  bill_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  payment_type: string | null;
  check_number: string | null;
  reference_number: string | null;
  description: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

interface GateInfo {
  id: string;
  name: string;
  sequence_number: number;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: {
    projectIds?: string;
    projectId?: string; // legacy
    vendorName?: string;
    categoryCode?: string;
    asOf?: string;
    gateId?: string;
  };
}

export default async function VendorDetailPage({ searchParams }: Props) {
  // Support both ?projectIds=id1,id2 and legacy ?projectId=id
  const projectIds: string[] = searchParams.projectIds
    ? searchParams.projectIds.split(",").filter(Boolean)
    : searchParams.projectId
    ? [searchParams.projectId]
    : [];
  const vendorName = searchParams.vendorName?.trim() ?? null;
  const categoryCode = searchParams.categoryCode ?? null;
  const asOf = searchParams.asOf ?? today();
  const gateIdFilter = searchParams.gateId ?? null;

  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");
  const { data: currentUser } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (currentUser as { role?: string } | null)?.role;
  const isAdmin = role === "admin";
  const canEditGate = role === "admin" || role === "project_manager";

  const [{ data: allProjects }, { data: rawCategories }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, code, appfolio_property_id")
      .order("name"),
    supabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  const projects = (allProjects ?? []) as ProjectInfo[];
  const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

  // Build lookup maps
  const propertyToProject = new Map<string, ProjectInfo>();
  for (const p of projects) {
    if (p.appfolio_property_id) propertyToProject.set(p.appfolio_property_id, p);
  }

  // Show empty state only when the page is freshly opened with no URL params.
  const hasRunParam = searchParams.asOf !== undefined ||
    searchParams.projectIds !== undefined ||
    searchParams.projectId !== undefined ||
    searchParams.vendorName !== undefined ||
    searchParams.categoryCode !== undefined;

  // ── No query params yet ───────────────────────────────
  if (!hasRunParam) {
    return (
      <div>
        <Header title="Vendor Detail Report" helpContent={HELP.vendorDetail} />
        <div className="p-4 sm:p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            gates={[]}
            currentProjectIds={[]}
            currentVendorName={null}
            currentCategoryCode={null}
            currentAsOf={asOf}
            currentGateId={null}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              Select a project or filter above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Build query ───────────────────────────────────────
  let transactions: VendorTransaction[] = [];

  const allLinkedPropertyIds = projects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  const selectedProjects = projectIds.length > 0
    ? projects.filter((p) => projectIds.includes(p.id))
    : projects;
  const queryPropertyIds = selectedProjects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  const propertyIdsToQuery = projectIds.length > 0 ? queryPropertyIds : allLinkedPropertyIds;

  if (propertyIdsToQuery.length > 0) {
    let query = supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
        "cost_category_code, cost_category_name, bill_date, due_date, payment_date, " +
        "invoice_amount, paid_amount, unpaid_amount, payment_status, payment_type, " +
        "check_number, reference_number, description"
      )
      .lte("bill_date", asOf < appfolioDateCap() ? asOf : appfolioDateCap())
      .in("appfolio_property_id", propertyIdsToQuery);

    if (vendorName) {
      query = query.ilike("vendor_name", `%${vendorName}%`);
    }

    if (categoryCode) {
      query = query.ilike("cost_category_code", categoryCode);
    }

    const { data: rawTx } = await query.order("bill_date", { ascending: false });
    transactions = (rawTx ?? []) as VendorTransaction[];
  }

  // Fetch notes for displayed transactions
  const txIds = transactions.map((t) => t.id);
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

  // ── Fetch gate assignments ────────────────────────────
  type GateAssignment = { appfolio_transaction_id: string; gate_id: string; is_override: boolean };
  const gateAssignmentByTxId = new Map<string, GateAssignment>();
  if (txIds.length > 0) {
    const { data: rawGAs } = await supabase
      .from("transaction_gate_assignments")
      .select("appfolio_transaction_id, gate_id, is_override")
      .in("appfolio_transaction_id", txIds);
    for (const ga of (rawGAs ?? []) as GateAssignment[]) {
      gateAssignmentByTxId.set(ga.appfolio_transaction_id, ga);
    }
  }

  // Fetch gates for relevant projects (for display + dropdown)
  const relevantProjectIds = selectedProjects.map((p) => p.id);
  const gatesByProjectId = new Map<string, GateInfo[]>();
  const gateNameById = new Map<string, { name: string; sequence_number: number }>();
  const allGatesFlat: GateInfo[] = [];
  if (relevantProjectIds.length > 0) {
    const { data: rawGates } = await supabase
      .from("gates")
      .select("id, project_id, name, sequence_number")
      .in("project_id", relevantProjectIds)
      .order("sequence_number", { ascending: true });
    for (const g of (rawGates ?? []) as (GateInfo & { project_id: string })[]) {
      if (!gatesByProjectId.has(g.project_id)) gatesByProjectId.set(g.project_id, []);
      gatesByProjectId.get(g.project_id)!.push({ id: g.id, name: g.name, sequence_number: g.sequence_number });
      gateNameById.set(g.id, { name: g.name, sequence_number: g.sequence_number });
      if (!allGatesFlat.find((x) => x.id === g.id)) allGatesFlat.push({ id: g.id, name: g.name, sequence_number: g.sequence_number });
    }
  }

  // ── Apply gate filter (in-memory, after assignments are loaded) ───
  if (gateIdFilter) {
    transactions = transactions.filter((tx) => {
      const ga = gateAssignmentByTxId.get(tx.id);
      return ga?.gate_id === gateIdFilter;
    });
  }

  // AppFolio base URL for bill deep-links
  const appfolioBaseUrl = process.env.APPFOLIO_DATABASE_URL
    ? `https://${process.env.APPFOLIO_DATABASE_URL}`
    : null;

  // ── Totals ────────────────────────────────────────────
  const totalInvoice = transactions.reduce((s, t) => s + Number(t.invoice_amount), 0);
  const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
  const totalUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);

  // ── Labels ────────────────────────────────────────────
  const showProjectCol = projectIds.length !== 1;

  const projectLabel = projectIds.length === 0
    ? "All Projects"
    : projectIds.length === 1
    ? (() => { const p = projects.find((p) => p.id === projectIds[0]); return p ? `${p.code} — ${p.name}` : "Unknown"; })()
    : `${projectIds.length} Projects`;

  const selectedCategory = categoryCode
    ? categories.find((c) => c.code.toUpperCase() === categoryCode.toUpperCase())
    : null;
  const categoryLabel = selectedCategory
    ? `${selectedCategory.code} — ${selectedCategory.name}`
    : categoryCode ?? "All Categories";

  const vendorLabel = vendorName ?? "All Vendors";

  const noAppFolioLink = projectIds.length > 0 && queryPropertyIds.length === 0;

  // Build enriched transactions for export (includes gate name)
  const txWithGate = transactions.map((tx) => {
    const ga = gateAssignmentByTxId.get(tx.id);
    const gateData = ga ? gateNameById.get(ga.gate_id) : null;
    return {
      ...tx,
      gate_name: gateData ? `Gate ${gateData.sequence_number} — ${gateData.name}` : "",
    };
  });

  return (
    <div>
      <Header title="Vendor Detail Report" helpContent={HELP.vendorDetail} />
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            categories={categories}
            gates={allGatesFlat}
            currentProjectIds={projectIds}
            currentVendorName={vendorName}
            currentCategoryCode={categoryCode}
            currentAsOf={asOf}
            currentGateId={gateIdFilter}
          />
        </div>

        {/* Report header */}
        <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Vendor Detail Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              <span className="font-medium text-foreground">{vendorLabel}</span>
              &nbsp;·&nbsp;
              {categoryLabel}
              {gateIdFilter && gateNameById.has(gateIdFilter) && (
                <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                  G{gateNameById.get(gateIdFilter)!.sequence_number} — {gateNameById.get(gateIdFilter)!.name}
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
              columns={VENDOR_DETAIL_COLUMNS}
              storageKey="cols_vendor_detail"
            />
            {transactions.length > 0 && (
              <ExportButtons
                transactions={txWithGate}
                projects={projects}
                vendorLabel={vendorLabel}
                asOf={asOf}
              />
            )}
          </div>
        </div>

        {noAppFolioLink && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            This project is not linked to an AppFolio property — no transaction data available.
          </div>
        )}

        {!noAppFolioLink && transactions.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No transactions found matching your filters.
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
                  {showProjectCol && (
                    <th data-col="project" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>
                  )}
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
                  <th data-col="gate" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Gate</th>
                  <th data-col="reference" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Reference</th>
                  <th data-col="notes" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const txProject = propertyToProject.get(tx.appfolio_property_id);
                  const ga = gateAssignmentByTxId.get(tx.id);
                  const gateData = ga ? gateNameById.get(ga.gate_id) : null;
                  const projectGates = txProject ? (gatesByProjectId.get(txProject.id) ?? []) : [];
                  const detailBase = txProject
                    ? `/reports/cost-detail?projectId=${txProject.id}&asOf=${asOf}${tx.cost_category_code ? `&categoryCode=${tx.cost_category_code}` : ""}`
                    : null;

                  return (
                    <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      {showProjectCol && (
                        <td data-col="project" className="px-3 py-2 whitespace-nowrap">
                          {txProject ? (
                            <span className="font-mono text-[10px] text-muted-foreground">{txProject.code}</span>
                          ) : "—"}
                        </td>
                      )}
                      <td data-col="bill_date" className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(tx.bill_date)}
                      </td>
                      <td data-col="vendor" className="px-3 py-2 font-medium">{tx.vendor_name}</td>
                      <td data-col="description" className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
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
                        ) : detailBase ? (
                          <Link href={detailBase} className="text-blue-600 hover:underline" title="View cost detail">
                            {usd(Number(tx.invoice_amount))}
                          </Link>
                        ) : usd(Number(tx.invoice_amount))}
                      </td>
                      <td data-col="paid" className="px-3 py-2 text-right tabular-nums text-green-700">
                        {detailBase ? (
                          <Link href={`${detailBase}&paymentFilter=paid`} className="hover:underline" title="View paid costs">
                            {usd(Number(tx.paid_amount))}
                          </Link>
                        ) : usd(Number(tx.paid_amount))}
                      </td>
                      <td data-col="unpaid" className="px-3 py-2 text-right tabular-nums text-amber-700">
                        {Number(tx.unpaid_amount) !== 0 ? (
                          detailBase ? (
                            <Link href={`${detailBase}&paymentFilter=unpaid`} className="hover:underline" title="View unpaid costs">
                              {usd(Number(tx.unpaid_amount))}
                            </Link>
                          ) : usd(Number(tx.unpaid_amount))
                        ) : "—"}
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
                  <td data-col="bill_date" className="px-3 py-3" />
                  <td data-col="vendor" className="px-3 py-3">TOTAL — {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</td>
                  <td data-col="description" className="px-3 py-3" />
                  <td data-col="gl_account" className="px-3 py-3" />
                  <td data-col="cost_category" className="px-3 py-3" />
                  <td data-col="invoice_amt" className="px-3 py-3 text-right tabular-nums">{usd(totalInvoice)}</td>
                  <td data-col="paid" className="px-3 py-3 text-right tabular-nums">{usd(totalPaid)}</td>
                  <td data-col="unpaid" className="px-3 py-3 text-right tabular-nums">{totalUnpaid !== 0 ? usd(totalUnpaid) : "—"}</td>
                  <td data-col="status" className="px-3 py-3" />
                  <td data-col="check_num" className="px-3 py-3" />
                  <td data-col="gate" className="px-3 py-3" />
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

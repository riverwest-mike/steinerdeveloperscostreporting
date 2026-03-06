export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { HELP } from "@/lib/help";
import { COLogControls } from "./log-controls";
import { COLogExport } from "./log-export";
import { ColumnPicker } from "@/components/column-picker";

const CO_LOG_COLUMNS = [
  { key: "project", label: "Project" },
  { key: "co_num", label: "CO #", required: true },
  { key: "status", label: "Status", required: true },
  { key: "gate", label: "Gate" },
  { key: "contract", label: "Contract / Type" },
  { key: "cost_category", label: "Cost Category" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount", required: true },
  { key: "proposed_date", label: "Proposed" },
  { key: "approved_date", label: "Approved" },
  { key: "notes", label: "Notes" },
];

/* ─── Helpers ─────────────────────────────────────────── */

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/* ─── Types ───────────────────────────────────────────── */

export interface COLogRow {
  id: string;
  coNumber: string;
  description: string;
  amount: number;
  status: string;
  proposedDate: string;
  approvedDate: string | null;
  rejectionReason: string | null;
  notes: string | null;
  teamsUrl: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  gateName: string;
  gateId: string;
  contractId: string | null;
  contractVendor: string | null;
  costCategoryCode: string;
  costCategoryName: string;
  isBudgetCO: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  proposed: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  voided: "bg-gray-100 text-gray-500",
};

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: Promise<{
    projectIds?: string;
    status?: string;
    categoryId?: string;
    dateFrom?: string;
    dateTo?: string;
    type?: string;
  }>;
}

export default async function ChangeOrderLogPage({ searchParams }: Props) {
  const sp = await searchParams;
  const projectIds = sp.projectIds
    ? sp.projectIds.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const statusFilter = sp.status ?? "all";
  const categoryId = sp.categoryId ?? null;
  const dateFrom = sp.dateFrom ?? null;
  const dateTo = sp.dateTo ?? null;
  const typeFilter = sp.type ?? "all"; // "all" | "contract" | "budget"

  const supabase = createAdminClient();

  const [{ data: allProjects }, { data: allCategories }] = await Promise.all([
    supabase.from("projects").select("id, name, code").order("name"),
    supabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  const projects = (allProjects ?? []) as { id: string; name: string; code: string }[];
  const categories = (allCategories ?? []) as { id: string; name: string; code: string }[];

  const hasFilter =
    sp.projectIds !== undefined ||
    sp.status !== undefined ||
    sp.categoryId !== undefined ||
    sp.dateFrom !== undefined ||
    sp.dateTo !== undefined ||
    sp.type !== undefined;

  if (!hasFilter) {
    return (
      <div>
        <Header title="Change Order Log" helpContent={HELP.changeOrderLog} />
        <div className="p-4 sm:p-6">
          <COLogControls
            projects={projects}
            categories={categories}
            currentProjectIds={[]}
            currentStatus="all"
            currentCategoryId={null}
            currentDateFrom={null}
            currentDateTo={null}
            currentType="all"
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

  // ── Fetch change orders ───────────────────────────────

  type RawCO = {
    id: string;
    co_number: string;
    description: string;
    amount: number;
    status: string;
    proposed_date: string;
    approved_date: string | null;
    rejection_reason: string | null;
    notes: string | null;
    teams_url: string | null;
    gate_id: string;
    contract_id: string | null;
    cost_category_id: string;
    gate: { id: string; name: string; project_id: string } | null;
    contract: { id: string; vendor_name: string } | null;
    category: { id: string; name: string; code: string } | null;
  };

  let query = supabase
    .from("change_orders")
    .select(
      "id, co_number, description, amount, status, proposed_date, approved_date, rejection_reason, notes, teams_url, gate_id, contract_id, cost_category_id, " +
      "gate:gates(id,name,project_id), " +
      "contract:contracts(id,vendor_name), " +
      "category:cost_categories(id,name,code)"
    )
    .order("proposed_date", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (categoryId) {
    query = query.eq("cost_category_id", categoryId);
  }
  if (dateFrom) {
    query = query.gte("proposed_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("proposed_date", dateTo);
  }
  if (typeFilter === "contract") {
    query = query.not("contract_id", "is", null);
  } else if (typeFilter === "budget") {
    query = query.is("contract_id", null);
  }

  const { data: rawCOs } = await query;
  const allCOs = (rawCOs ?? []) as RawCO[];

  // Build project map for gate-based project lookup
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Filter by project after fetch (since project_id is on the gate)
  const filtered = allCOs.filter((co) => {
    if (projectIds.length === 0) return true;
    const projId = co.gate?.project_id;
    return projId ? projectIds.includes(projId) : false;
  });

  // Build display rows
  const rows: COLogRow[] = filtered.map((co) => {
    const gateProjectId = co.gate?.project_id ?? "";
    const proj = projectMap.get(gateProjectId);
    return {
      id: co.id,
      coNumber: co.co_number,
      description: co.description,
      amount: Number(co.amount),
      status: co.status,
      proposedDate: co.proposed_date,
      approvedDate: co.approved_date,
      rejectionReason: co.rejection_reason,
      notes: co.notes,
      teamsUrl: co.teams_url,
      projectId: gateProjectId,
      projectCode: proj?.code ?? "",
      projectName: proj?.name ?? "",
      gateName: co.gate?.name ?? "—",
      gateId: co.gate_id,
      contractId: co.contract_id,
      contractVendor: co.contract?.vendor_name ?? null,
      costCategoryCode: co.category?.code ?? "",
      costCategoryName: co.category?.name ?? "",
      isBudgetCO: !co.contract_id,
    };
  });

  // ── Totals ────────────────────────────────────────────
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const approvedTotal = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const proposedTotal = rows.filter((r) => r.status === "proposed").reduce((s, r) => s + r.amount, 0);

  const selectedProjects = projectIds.length > 0
    ? projects.filter((p) => projectIds.includes(p.id))
    : [];
  const projectLabel = selectedProjects.length === 0
    ? "All Projects"
    : selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : selectedProjects.map((p) => p.code).join(", ");

  const showProjectCol = selectedProjects.length !== 1;

  return (
    <div>
      <Header title="Change Order Log" helpContent={HELP.changeOrderLog} />
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          <COLogControls
            projects={projects}
            categories={categories}
            currentProjectIds={projectIds}
            currentStatus={statusFilter}
            currentCategoryId={categoryId}
            currentDateFrom={dateFrom}
            currentDateTo={dateTo}
            currentType={typeFilter}
          />
        </div>

        <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3 mt-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Change Order Log</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              <span className="capitalize">{statusFilter === "all" ? "All Statuses" : statusFilter}</span>
              &nbsp;·&nbsp;
              {rows.length} change order{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <ColumnPicker
              columns={CO_LOG_COLUMNS}
              storageKey="cols_co_log"
            />
            {rows.length > 0 && (
              <COLogExport rows={rows} projectLabel={projectLabel} showProjectCol={showProjectCol} />
            )}
          </div>
        </div>

        {/* Summary cards */}
        {rows.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl print:hidden">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total (all)</p>
              <p className="text-base font-semibold tabular-nums">{usd(totalAmount)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-base font-semibold tabular-nums text-green-700">{usd(approvedTotal)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Proposed</p>
              <p className="text-base font-semibold tabular-nums text-amber-700">{usd(proposedTotal)}</p>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">No change orders found matching your filters.</p>
          </div>
        ) : (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 0; }
                table { font-size: 7pt !important; width: 100% !important; }
                th, td { padding: 1pt 3pt !important; }
              }
            `}</style>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {showProjectCol && (
                      <th data-col="project" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>
                    )}
                    <th data-col="co_num" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">CO #</th>
                    <th data-col="status" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Status</th>
                    <th data-col="gate" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Gate</th>
                    <th data-col="contract" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Contract / Type</th>
                    <th data-col="cost_category" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Cost Category</th>
                    <th data-col="description" className="px-3 py-2.5 text-left font-medium">Description</th>
                    <th data-col="amount" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Amount</th>
                    <th data-col="proposed_date" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Proposed</th>
                    <th data-col="approved_date" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Approved</th>
                    <th data-col="notes" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      {showProjectCol && (
                        <td data-col="project" className="px-3 py-2 whitespace-nowrap">
                          <Link
                            href={`/projects/${row.projectId}`}
                            className="font-mono text-[10px] text-primary underline underline-offset-2 hover:opacity-75"
                          >
                            {row.projectCode}
                          </Link>
                        </td>
                      )}
                      <td data-col="co_num" className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                        {row.contractId ? (
                          <Link
                            href={`/projects/${row.projectId}/contracts/${row.contractId}`}
                            className="text-primary underline underline-offset-2 hover:opacity-75"
                          >
                            {row.coNumber}
                          </Link>
                        ) : (
                          row.coNumber
                        )}
                      </td>
                      <td data-col="status" className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_BADGE[row.status] ?? "bg-gray-100"}`}>
                          {row.status}
                        </span>
                      </td>
                      <td data-col="gate" className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        <Link
                          href={`/projects/${row.projectId}/gates/${row.gateId}`}
                          className="hover:text-foreground hover:underline underline-offset-2"
                        >
                          {row.gateName}
                        </Link>
                      </td>
                      <td data-col="contract" className="px-3 py-2 whitespace-nowrap">
                        {row.contractVendor ? (
                          <Link
                            href={`/projects/${row.projectId}/contracts/${row.contractId}`}
                            className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                          >
                            {row.contractVendor}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 font-medium">
                            Budget CO
                          </span>
                        )}
                      </td>
                      <td data-col="cost_category" className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-[10px] text-muted-foreground">{row.costCategoryCode}</span>
                        {row.costCategoryName && (
                          <span className="ml-1 text-muted-foreground">{row.costCategoryName}</span>
                        )}
                      </td>
                      <td data-col="description" className="px-3 py-2 max-w-[240px]">
                        <p className="truncate">{row.description}</p>
                        {row.status === "rejected" && row.rejectionReason && (
                          <p className="text-[10px] text-destructive mt-0.5 truncate">
                            Rejected: {row.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td data-col="amount" className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                        {usd(row.amount)}
                      </td>
                      <td data-col="proposed_date" className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(row.proposedDate)}
                      </td>
                      <td data-col="approved_date" className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(row.approvedDate)}
                      </td>
                      <td data-col="notes" className="px-3 py-2 text-muted-foreground max-w-[180px]">
                        {row.notes ? (
                          <p className="truncate text-xs">{row.notes}</p>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold">
                    <td className="px-3 py-3" colSpan={showProjectCol ? 7 : 6}>
                      TOTAL — {rows.length} CO{rows.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totalAmount)}</td>
                    <td colSpan={3} />
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

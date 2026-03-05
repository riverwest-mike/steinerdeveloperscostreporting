export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";
import { ExportButtons } from "./export-buttons";

/* ─── Helpers ─────────────────────────────────────────── */

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): string {
  return localDateStr(new Date());
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

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Types ───────────────────────────────────────────── */

export interface CommitmentRow {
  contractId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  vendorName: string;
  contractNumber: string | null;
  contractDescription: string;
  status: string;
  executionDate: string | null;
  gates: string;
  costCategoryCode: string;
  costCategoryName: string;
  /** Sum of SOV line items for this category, or original_value for non-SOV contracts */
  baseAmount: number;
  /** Sum of approved COs on this contract for this category */
  approvedCOs: number;
  /** baseAmount + approvedCOs */
  totalCommitted: number;
  retainagePct: number;
  isSov: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  code: string;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: {
    projectIds?: string;
    projectId?: string;
    categoryCode?: string;
    contractStatus?: string;
    asOf?: string;
  };
}

export default async function CommitmentDetailPage({ searchParams }: Props) {
  const rawIds = searchParams.projectIds ?? searchParams.projectId ?? null;
  const projectIds = rawIds ? rawIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const categoryCode = searchParams.categoryCode ?? null;
  const contractStatus = searchParams.contractStatus ?? "active_complete";
  const asOf = searchParams.asOf ?? today();

  const supabase = createAdminClient();

  const [{ data: allProjects }, { data: rawCategories }] = await Promise.all([
    supabase.from("projects").select("id, name, code").order("name"),
    supabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  const projects = (allProjects ?? []) as ProjectInfo[];
  const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

  const projectMap = new Map<string, ProjectInfo>(projects.map((p) => [p.id, p]));
  const categoryByCode = new Map<string, { id: string; name: string; code: string }>();
  for (const c of categories) {
    categoryByCode.set(c.code.trim().toUpperCase(), c);
  }

  // Detect whether any filter params have been provided
  const hasRunParam =
    searchParams.asOf !== undefined ||
    searchParams.projectIds !== undefined ||
    searchParams.projectId !== undefined ||
    searchParams.categoryCode !== undefined ||
    searchParams.contractStatus !== undefined;

  if (!hasRunParam) {
    return (
      <div>
        <Header title="Commitment Detail Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectIds={[]}
            currentCategoryCode={null}
            currentContractStatus="active_complete"
            currentAsOf={asOf}
          />
          <ReportRestorer />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              Select filters above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Load contracts ────────────────────────────────────
  type RawContract = {
    id: string;
    project_id: string;
    vendor_name: string;
    contract_number: string | null;
    description: string;
    original_value: number;
    approved_co_amount: number;
    revised_value: number;
    retainage_pct: number;
    execution_date: string | null;
    status: string;
    cost_category_id: string;
    category: { id: string; name: string; code: string } | null;
    contract_gates: { gate: { id: string; name: string; sequence_number: number } | null }[];
    contract_line_items: {
      id: string;
      cost_category_id: string;
      description: string | null;
      amount: number;
      category: { id: string; name: string; code: string } | null;
    }[];
  };

  let contractQuery = supabase
    .from("contracts")
    .select(
      "id, project_id, vendor_name, contract_number, description, " +
      "original_value, approved_co_amount, revised_value, retainage_pct, " +
      "execution_date, status, cost_category_id, " +
      "category:cost_categories(id,name,code), " +
      "contract_gates(gate:gates(id,name,sequence_number)), " +
      "contract_line_items(id,cost_category_id,description,amount,category:cost_categories(id,name,code))"
    )
    .or(`execution_date.is.null,execution_date.lte.${asOf}`)
    .neq("status", "terminated");

  if (projectIds.length > 0) {
    contractQuery = contractQuery.in("project_id", projectIds);
  }

  // Apply status filter
  if (contractStatus === "active") {
    contractQuery = contractQuery.eq("status", "active");
  } else if (contractStatus === "complete") {
    contractQuery = contractQuery.eq("status", "complete");
  }
  // "active_complete" = both (already excluded "terminated" above); "all" includes terminated
  if (contractStatus === "all") {
    // Re-run without the terminated exclusion — build a fresh query
    contractQuery = supabase
      .from("contracts")
      .select(
        "id, project_id, vendor_name, contract_number, description, " +
        "original_value, approved_co_amount, revised_value, retainage_pct, " +
        "execution_date, status, cost_category_id, " +
        "category:cost_categories(id,name,code), " +
        "contract_gates(gate:gates(id,name,sequence_number)), " +
        "contract_line_items(id,cost_category_id,description,amount,category:cost_categories(id,name,code))"
      )
      .or(`execution_date.is.null,execution_date.lte.${asOf}`);
    if (projectIds.length > 0) {
      contractQuery = contractQuery.in("project_id", projectIds);
    }
  }

  const { data: rawContracts } = await contractQuery;
  const contracts = (rawContracts ?? []) as RawContract[];

  // ── Load approved COs for SOV contracts ──────────────
  const sovContractIds = contracts
    .filter((c) => c.contract_line_items.length > 0)
    .map((c) => c.id);

  type RawCO = {
    contract_id: string;
    cost_category_id: string;
    co_number: string;
    amount: number;
    category: { id: string; name: string; code: string } | null;
  };

  const cosByContract = new Map<string, RawCO[]>();
  if (sovContractIds.length > 0) {
    const { data: rawCOs } = await supabase
      .from("change_orders")
      .select("contract_id, cost_category_id, co_number, amount, category:cost_categories(id,name,code)")
      .in("contract_id", sovContractIds)
      .eq("status", "approved");

    for (const co of (rawCOs ?? []) as RawCO[]) {
      const list = cosByContract.get(co.contract_id) ?? [];
      list.push(co);
      cosByContract.set(co.contract_id, list);
    }
  }

  // ── Build CommitmentRows ──────────────────────────────
  // Filter by categoryCode if provided
  const filterCatId = categoryCode
    ? categoryByCode.get(categoryCode.trim().toUpperCase())?.id ?? null
    : null;

  const rows: CommitmentRow[] = [];

  for (const c of contracts) {
    const proj = projectMap.get(c.project_id);
    const gateNames = c.contract_gates
      .map((cg) => cg.gate)
      .filter(Boolean)
      .sort((a, b) => (a!.sequence_number ?? 0) - (b!.sequence_number ?? 0))
      .map((g) => g!.name)
      .join(", ");

    if (c.contract_line_items.length > 0) {
      // SOV contract — group line items by cost_category_id
      const liByCategory = new Map<string, { code: string; name: string; total: number }>();
      for (const li of c.contract_line_items) {
        const cat = li.category ?? { id: li.cost_category_id, name: "", code: "" };
        const prev = liByCategory.get(li.cost_category_id);
        liByCategory.set(li.cost_category_id, {
          code: cat.code,
          name: cat.name,
          total: (prev?.total ?? 0) + Number(li.amount),
        });
      }

      // Group approved COs by cost_category_id
      const coByCategory = new Map<string, number>();
      for (const co of cosByContract.get(c.id) ?? []) {
        coByCategory.set(co.cost_category_id,
          (coByCategory.get(co.cost_category_id) ?? 0) + Number(co.amount));
      }

      // Emit one row per cost category that appears in SOV lines or COs
      const allCatIds = new Set([...liByCategory.keys(), ...coByCategory.keys()]);
      for (const catId of allCatIds) {
        if (filterCatId && catId !== filterCatId) continue;

        const liInfo = liByCategory.get(catId);
        const coAmt = coByCategory.get(catId) ?? 0;
        const base = liInfo?.total ?? 0;
        // Resolve category name/code — prefer from liInfo, fall back to categories list
        let catCode = liInfo?.code ?? "";
        let catName = liInfo?.name ?? "";
        if (!catCode) {
          const fallback = categories.find((x) => x.id === catId);
          catCode = fallback?.code ?? catId;
          catName = fallback?.name ?? "";
        }

        rows.push({
          contractId: c.id,
          projectId: c.project_id,
          projectCode: proj?.code ?? "",
          projectName: proj?.name ?? "",
          vendorName: c.vendor_name,
          contractNumber: c.contract_number,
          contractDescription: c.description,
          status: c.status,
          executionDate: c.execution_date,
          gates: gateNames,
          costCategoryCode: catCode,
          costCategoryName: catName,
          baseAmount: base,
          approvedCOs: coAmt,
          totalCommitted: base + coAmt,
          retainagePct: Number(c.retainage_pct),
          isSov: true,
        });
      }
    } else {
      // Non-SOV contract — single row under contract's cost_category_id
      if (filterCatId && c.cost_category_id !== filterCatId) continue;

      const cat = c.category;
      rows.push({
        contractId: c.id,
        projectId: c.project_id,
        projectCode: proj?.code ?? "",
        projectName: proj?.name ?? "",
        vendorName: c.vendor_name,
        contractNumber: c.contract_number,
        contractDescription: c.description,
        status: c.status,
        executionDate: c.execution_date,
        gates: gateNames,
        costCategoryCode: cat?.code ?? "",
        costCategoryName: cat?.name ?? "",
        baseAmount: Number(c.original_value),
        approvedCOs: Number(c.approved_co_amount),
        totalCommitted: Number(c.revised_value),
        retainagePct: Number(c.retainage_pct),
        isSov: false,
      });
    }
  }

  // Sort by cost category code, then vendor name
  rows.sort((a, b) => {
    const catCmp = a.costCategoryCode.localeCompare(b.costCategoryCode);
    if (catCmp !== 0) return catCmp;
    return a.vendorName.localeCompare(b.vendorName);
  });

  // ── Labels ────────────────────────────────────────────
  const selectedProjects = projectIds.length > 0
    ? projects.filter((p) => projectIds.includes(p.id))
    : [];
  const projectLabel = selectedProjects.length === 0
    ? "All Projects"
    : selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : selectedProjects.map((p) => p.code).join(", ") + ` (${selectedProjects.length} projects)`;

  const selectedCategory = categoryCode
    ? categoryByCode.get(categoryCode.trim().toUpperCase()) ?? null
    : null;
  const categoryLabel = selectedCategory
    ? `${selectedCategory.code} — ${selectedCategory.name}`
    : categoryCode ?? "All Cost Categories";

  const statusLabel =
    contractStatus === "active" ? "Active Contracts" :
    contractStatus === "complete" ? "Complete Contracts" :
    contractStatus === "terminated" ? "Terminated Contracts" :
    contractStatus === "all" ? "All Contracts" :
    "Active & Complete Contracts";

  // ── Totals ────────────────────────────────────────────
  const totalBase = rows.reduce((s, r) => s + r.baseAmount, 0);
  const totalCOs = rows.reduce((s, r) => s + r.approvedCOs, 0);
  const totalCommitted = rows.reduce((s, r) => s + r.totalCommitted, 0);

  const showProjectCol = selectedProjects.length !== 1;

  return (
    <div>
      <Header title="Commitment Detail Report" />
      <div className="p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectIds={projectIds}
            currentCategoryCode={categoryCode}
            currentContractStatus={contractStatus}
            currentAsOf={asOf}
          />
        </div>

        {/* Report header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Commitment Detail Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              <span className="font-medium text-foreground">{categoryLabel}</span>
              &nbsp;·&nbsp;
              {statusLabel}
              &nbsp;·&nbsp; As of{" "}
              {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          {rows.length > 0 && (
            <ExportButtons
              rows={rows}
              projectLabel={projectLabel}
              categoryLabel={categoryLabel}
              statusLabel={statusLabel}
              asOf={asOf}
              showProjectCol={showProjectCol}
            />
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No commitments found matching your filters.
            </p>
          </div>
        ) : (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 0.4in; }
                table { font-size: 7pt !important; min-width: 0 !important; width: 100% !important; }
                th, td { padding: 1pt 3pt !important; }
              }
            `}</style>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {showProjectCol && (
                      <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>
                    )}
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Vendor</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Contract #</th>
                    <th className="px-3 py-2.5 text-left font-medium">Contract Description</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Cost Category</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Gate(s)</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Execution Date</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Base Amount</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Approved COs</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Total Committed</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Retainage %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={`${row.contractId}-${row.costCategoryCode}-${idx}`}
                        className="border-t border-slate-100 hover:bg-slate-50/50">
                      {showProjectCol && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-mono text-[10px] text-muted-foreground">{row.projectCode}</span>
                        </td>
                      )}
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <Link
                          href={`/projects/${row.projectId}/contracts/${row.contractId}`}
                          className="text-primary underline underline-offset-2 hover:opacity-75"
                        >
                          {row.vendorName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                        {row.contractNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                        {row.contractDescription}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-[10px] text-muted-foreground">{row.costCategoryCode}</span>
                        {row.costCategoryName && (
                          <span className="ml-1">{row.costCategoryName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.gates || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(row.executionDate)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            row.status === "active"
                              ? "bg-green-100 text-green-800"
                              : row.status === "complete"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(row.baseAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {usd(row.approvedCOs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{usd(row.totalCommitted)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.retainagePct > 0 ? `${row.retainagePct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
                    <td className="px-3 py-3" colSpan={showProjectCol ? 8 : 7}>
                      TOTAL — {rows.length} line{rows.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totalBase)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totalCOs)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{usd(totalCommitted)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700 mb-1 uppercase tracking-wide text-[10px]">Notes</p>
              <ul className="space-y-0.5">
                <li><span className="font-semibold text-slate-800">Base Amount</span> — Original SOV line item amount(s) for this cost category, or original contract value for contracts without a Schedule of Values.</li>
                <li><span className="font-semibold text-slate-800">Approved COs</span> — Approved change orders attributed to this cost category on this contract.</li>
                <li><span className="font-semibold text-slate-800">Total Committed</span> — Base Amount + Approved COs. Matches column G of the Project Cost Management Report.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

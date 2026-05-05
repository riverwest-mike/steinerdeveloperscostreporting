export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleProjectIds } from "@/lib/access";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";
import { ExportButtons } from "./export-buttons";
import { ColumnPicker } from "@/components/column-picker";
import { HELP } from "@/lib/help";
import { CostDetailTable, type CostDetailRow } from "./cost-detail-table";

const COST_DETAIL_COLUMNS = [
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

/* ─── Types ───────────────────────────────────────────── */

interface Transaction {
  id: string;
  appfolio_bill_id: string;
  vendor_name: string;
  gl_account_id: string;
  gl_account_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  cost_category_code_override: string | null;
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

interface GateInfo {
  id: string;
  name: string;
  sequence_number: number;
}

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: { projectIds?: string; projectId?: string; asOf?: string; categoryCode?: string; paymentFilter?: string; gateId?: string };
}

export default async function CostDetailPage({ searchParams }: Props) {
  // Support new ?projectIds=id1,id2 and legacy ?projectId=id
  const rawIds = searchParams.projectIds ?? searchParams.projectId ?? null;
  const projectIds = rawIds ? rawIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const asOf = searchParams.asOf ?? today();
  const categoryCode = searchParams.categoryCode ?? null;
  const paymentFilter = searchParams.paymentFilter ?? null;
  const gateIdFilter = searchParams.gateId ?? null;

  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");
  const { data: currentUser } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (currentUser as { role?: string } | null)?.role;
  const isAdmin = role === "admin" || role === "development_lead";
  const canEditGate = role === "admin" || role === "project_manager" || role === "development_lead";

  const allowedProjectIds = await getAccessibleProjectIds(supabase, userId);

  // Load projects (scoped to accessible projects) and cost categories for controls
  let projectsQuery = supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id, status")
    .order("name");
  if (allowedProjectIds !== null) {
    projectsQuery = projectsQuery.in("id", allowedProjectIds.length > 0 ? allowedProjectIds : [""]);
  }
  const [{ data: allProjects }, { data: rawCategories }] = await Promise.all([
    projectsQuery,
    supabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  const projects = (allProjects ?? []) as {
    id: string; name: string; code: string; appfolio_property_id: string | null; status: string;
  }[];
  const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

  // Constrain any projectIds from the URL to only those the user can access
  const authorizedProjectIds = projectIds.filter((id) => projects.some((p) => p.id === id));

  // ── No project selected ───────────────────────────────
  if (projectIds.length === 0) {
    return (
      <div>
        <Header title="Cost Detail Report" helpContent={HELP.costDetail} />
        <div className="p-4 sm:p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            gates={[]}
            currentProjectIds={[]}
            currentAsOf={asOf}
            currentCategoryCode={null}
            currentGateId={null}
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

  // ── Resolve selected projects ──────────────────────────
  const selectedProjects = projects.filter((p) => authorizedProjectIds.includes(p.id));
  const linkedPropertyIds = selectedProjects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  const propertyToProject = new Map(
    projects.filter((p) => p.appfolio_property_id).map((p) => [p.appfolio_property_id!, p])
  );

  // ── Fetch AppFolio transactions ───────────────────────
  let transactions: (Transaction & { appfolio_property_id: string })[] = [];

  if (linkedPropertyIds.length > 0) {
    let query = supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
        "cost_category_code, cost_category_name, cost_category_code_override, bill_date, due_date, payment_date, " +
        "invoice_amount, paid_amount, unpaid_amount, payment_status, payment_type, " +
        "check_number, reference_number, description"
      )
      .in("appfolio_property_id", linkedPropertyIds)
      .lte("bill_date", asOf < appfolioDateCap() ? asOf : appfolioDateCap());

    if (paymentFilter === "paid") {
      query = query.gt("paid_amount", 0);
    } else if (paymentFilter === "unpaid") {
      query = query.gt("unpaid_amount", 0);
    }

    // Pre-narrow at SQL level using a `like` against the numeric prefix
    // when a categoryCode is set. This dramatically reduces the result
    // set before the JS post-filter and avoids the default PostgREST
    // row cap from chopping off older matching transactions.
    if (categoryCode) {
      const trimmed = categoryCode.trim();
      const prefix = trimmed.split(/\s+/)[0] || trimmed;
      // Match either the exact full code or anything starting with the
      // numeric prefix followed by end-of-string or whitespace. The JS
      // post-filter below will tighten this back to PCM's exact rule.
      query = query.ilike("cost_category_code", `${prefix}%`);
    }

    const { data: rawTx } = await query
      .order("bill_date", { ascending: false })
      .limit(50000);
    transactions = (rawTx ?? []) as (Transaction & { appfolio_property_id: string })[];

    // Tighten the category filter in memory using the same matching rules
    // PCM uses to bucket transactions: accept either the full cat.code
    // (e.g. "010700 Survey") OR its numeric prefix ("010700") — because
    // AppFolio's vendor_ledger sync stores tx.cost_category_code as just
    // the numeric portion.
    if (categoryCode) {
      const target = categoryCode.trim().toUpperCase();
      const targetPrefix = target.split(/\s+/)[0];
      const accepted = new Set<string>([target]);
      if (targetPrefix && targetPrefix !== target) accepted.add(targetPrefix);
      transactions = transactions.filter((tx) => {
        const c = (tx.cost_category_code ?? "").trim().toUpperCase();
        if (c.length === 0) return false;
        if (accepted.has(c)) return true;
        // Also accept tx codes that start with the prefix followed by
        // whitespace ("010700 Survey" form when the URL carried just
        // the prefix), to match PCM's symmetric prefix behavior.
        const cPrefix = c.split(/\s+/)[0];
        return accepted.has(cPrefix);
      });
    }
  }

  // Fetch notes for all transactions on this page
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

  // Fetch gates for selected projects (for display + dropdown)
  const gatesByProjectId = new Map<string, GateInfo[]>();
  const gateNameById = new Map<string, { name: string; sequence_number: number }>();
  const allGatesFlat: GateInfo[] = [];
  if (selectedProjects.length > 0) {
    const { data: rawGates } = await supabase
      .from("gates")
      .select("id, project_id, name, sequence_number")
      .in("project_id", selectedProjects.map((p) => p.id))
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

  // AppFolio base URL for bill deep-links (server-side only — env var never reaches client)
  const appfolioBaseUrl = process.env.APPFOLIO_DATABASE_URL
    ? `https://${process.env.APPFOLIO_DATABASE_URL}`
    : null;

  // ── Category label ────────────────────────────────────
  const selectedCategory = categoryCode
    ? categories.find((c) => c.code.toUpperCase() === categoryCode.toUpperCase())
    : null;

  const categoryLabel = selectedCategory
    ? `${selectedCategory.code} — ${selectedCategory.name}`
    : categoryCode ?? "All Categories";

  const projectLabel = selectedProjects.length === 1
    ? `${selectedProjects[0].code} — ${selectedProjects[0].name}`
    : selectedProjects.length > 1
    ? selectedProjects.map((p) => p.code).join(", ") + ` (${selectedProjects.length} projects)`
    : "Unknown Project(s)";

  const showProjectCol = selectedProjects.length > 1;

  // Build enriched transactions for export (includes gate name)
  const txWithGate = transactions.map((tx) => {
    const ga = gateAssignmentByTxId.get(tx.id);
    const gateData = ga ? gateNameById.get(ga.gate_id) : null;
    return {
      ...tx,
      gate_name: gateData ? `Gate ${gateData.sequence_number} — ${gateData.name}` : "",
    };
  });

  // Build rows for the interactive client table (sortable / filterable headers).
  const tableRows: CostDetailRow[] = transactions.map((tx) => {
    const txProject = propertyToProject.get(tx.appfolio_property_id);
    const ga = gateAssignmentByTxId.get(tx.id);
    const gateData = ga ? gateNameById.get(ga.gate_id) : null;
    const projectGates = txProject ? (gatesByProjectId.get(txProject.id) ?? []) : [];
    return {
      id: tx.id,
      appfolio_bill_id: tx.appfolio_bill_id,
      appfolio_property_id: tx.appfolio_property_id,
      vendor_name: tx.vendor_name,
      gl_account_id: tx.gl_account_id,
      gl_account_name: tx.gl_account_name,
      cost_category_code: tx.cost_category_code,
      cost_category_name: tx.cost_category_name,
      cost_category_code_override: tx.cost_category_code_override,
      bill_date: tx.bill_date,
      invoice_amount: Number(tx.invoice_amount),
      paid_amount: Number(tx.paid_amount),
      unpaid_amount: Number(tx.unpaid_amount),
      payment_status: tx.payment_status,
      check_number: tx.check_number,
      reference_number: tx.reference_number,
      description: tx.description,
      project_id: txProject?.id ?? null,
      project_code: txProject?.code ?? null,
      gate_id: ga?.gate_id ?? null,
      gate_name: gateData?.name ?? null,
      gate_sequence: gateData?.sequence_number ?? null,
      gate_is_override: ga?.is_override ?? false,
      project_gates: projectGates,
      note: notesByBillId.get(tx.appfolio_bill_id) ?? null,
    };
  });

  return (
    <div>
      <Header title="Cost Detail Report" helpContent={HELP.costDetail} />
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            categories={categories}
            gates={allGatesFlat}
            currentProjectIds={projectIds}
            currentAsOf={asOf}
            currentCategoryCode={categoryCode}
            currentGateId={gateIdFilter}
            currentPaymentFilter={paymentFilter}
          />
        </div>

        {/* Report header */}
        <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3">
          <div className="print-header">
            <h2 className="text-xl font-bold tracking-tight">Cost Detail Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              {categoryLabel}
              {gateIdFilter && gateNameById.has(gateIdFilter) && (
                <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                  G{gateNameById.get(gateIdFilter)!.sequence_number} — {gateNameById.get(gateIdFilter)!.name}
                </span>
              )}
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
              columns={COST_DETAIL_COLUMNS}
              storageKey="cols_cost_detail"
            />
            {transactions.length > 0 && (
              <ExportButtons
                transactions={txWithGate}
                projectCode={selectedProjects.length === 1 ? selectedProjects[0].code : "multi"}
                projectName={projectLabel}
                categoryLabel={categoryLabel}
                asOf={asOf}
              />
            )}
          </div>
        </div>

        <div className="print:hidden">
          {linkedPropertyIds.length === 0 && (
            <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              {selectedProjects.length === 1
                ? "This project is not linked to an AppFolio property"
                : "None of the selected projects are linked to AppFolio properties"}{" "}
              — no transaction data available.
            </div>
          )}

          {linkedPropertyIds.length > 0 && transactions.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground text-sm">
                No AppFolio transactions found
                {categoryCode ? ` for cost category "${categoryCode}"` : ""}
                {gateIdFilter && gateNameById.has(gateIdFilter)
                  ? ` in gate G${gateNameById.get(gateIdFilter)!.sequence_number} — ${gateNameById.get(gateIdFilter)!.name}`
                  : ""}
                {" "}as of{" "}
                {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                .{" "}
                {!gateIdFilter && (
                  <>Run an AppFolio sync in{" "}
                  <Link href="/admin/appfolio" className="underline font-medium">Admin</Link>{" "}
                  to pull data.</>
                )}
              </p>
            </div>
          )}
        </div>

        {transactions.length > 0 && (
          <CostDetailTable
            rows={tableRows}
            showProjectCol={showProjectCol}
            categories={categories}
            canEditGate={canEditGate}
            isAdmin={isAdmin}
            appfolioBaseUrl={appfolioBaseUrl}
          />
        )}

      </div>
    </div>
  );
}

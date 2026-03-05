export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ReportRestorer } from "./report-restorer";
import { ExportButtons } from "./export-buttons";
import { HELP } from "@/lib/help";

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

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: {
    projectId?: string;
    vendorName?: string;
    categoryCode?: string;
    asOf?: string;
  };
}

export default async function VendorDetailPage({ searchParams }: Props) {
  const projectId = searchParams.projectId ?? null;
  const vendorName = searchParams.vendorName?.trim() ?? null;
  const categoryCode = searchParams.categoryCode ?? null;
  const asOf = searchParams.asOf ?? today();

  const supabase = createAdminClient();

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
  // The Run Report button always adds at least ?asOf=..., so any param presence
  // means the user has explicitly triggered the report. "All Projects" with no
  // other filter is valid — it returns all transactions across all projects.
  const hasRunParam = searchParams.asOf !== undefined ||
    searchParams.projectId !== undefined ||
    searchParams.vendorName !== undefined ||
    searchParams.categoryCode !== undefined;

  // ── No query params yet ───────────────────────────────
  if (!hasRunParam) {
    return (
      <div>
        <Header title="Vendor Detail Report" helpContent={HELP.vendorDetail} />
        <div className="p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectId={null}
            currentVendorName={null}
            currentCategoryCode={null}
            currentAsOf={asOf}
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

  // Determine which appfolio_property_ids to query
  const linkedPropertyIds = projects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  if (linkedPropertyIds.length > 0) {
    let query = supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
        "cost_category_code, cost_category_name, bill_date, due_date, payment_date, " +
        "invoice_amount, paid_amount, unpaid_amount, payment_status, payment_type, " +
        "check_number, reference_number, description"
      )
      .lte("bill_date", asOf < appfolioDateCap() ? asOf : appfolioDateCap());

    // Filter by project (single property) or all linked properties
    if (projectId) {
      const selectedProject = projects.find((p) => p.id === projectId);
      if (selectedProject?.appfolio_property_id) {
        query = query.eq("appfolio_property_id", selectedProject.appfolio_property_id);
      } else {
        // Project has no AppFolio link — return empty
        transactions = [];
      }
    } else {
      query = query.in("appfolio_property_id", linkedPropertyIds);
    }

    if (vendorName) {
      query = query.ilike("vendor_name", `%${vendorName}%`);
    }

    if (categoryCode) {
      query = query.ilike("cost_category_code", categoryCode);
    }

    if (!projectId || projects.find((p) => p.id === projectId)?.appfolio_property_id) {
      const { data: rawTx } = await query.order("bill_date", { ascending: false });
      transactions = (rawTx ?? []) as VendorTransaction[];
    }
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
  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;
  const projectLabel = selectedProject
    ? `${selectedProject.code} — ${selectedProject.name}`
    : "All Projects";

  const selectedCategory = categoryCode
    ? categories.find((c) => c.code.toUpperCase() === categoryCode.toUpperCase())
    : null;
  const categoryLabel = selectedCategory
    ? `${selectedCategory.code} — ${selectedCategory.name}`
    : categoryCode ?? "All Categories";

  const vendorLabel = vendorName ?? "All Vendors";

  const noAppFolioLink = !!projectId && !selectedProject?.appfolio_property_id;

  return (
    <div>
      <Header title="Vendor Detail Report" helpContent={HELP.vendorDetail} />
      <div className="p-6">
        <div className="print:hidden">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectId={projectId}
            currentVendorName={vendorName}
            currentCategoryCode={categoryCode}
            currentAsOf={asOf}
          />
        </div>

        {/* Report header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Vendor Detail Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {projectLabel}
              &nbsp;·&nbsp;
              <span className="font-medium text-foreground">{vendorLabel}</span>
              &nbsp;·&nbsp;
              {categoryLabel}
              &nbsp;·&nbsp; As of{" "}
              {new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          {transactions.length > 0 && (
            <ExportButtons
              transactions={transactions}
              projects={projects}
              vendorLabel={vendorLabel}
              asOf={asOf}
            />
          )}
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
              @page { size: landscape; margin: 0.4in; }
              table { font-size: 7pt !important; min-width: 0 !important; width: 100% !important; }
              th, td { padding: 1pt 3pt !important; }
            }
          `}</style>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  {!projectId && (
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Project</th>
                  )}
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Bill Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2.5 text-left font-medium">Description</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">GL Account</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Cost Category</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Invoice Amt</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Paid</th>
                  <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Unpaid</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Check #</th>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const txProject = propertyToProject.get(tx.appfolio_property_id);
                  const detailBase = txProject
                    ? `/reports/cost-detail?projectId=${txProject.id}&asOf=${asOf}${tx.cost_category_code ? `&categoryCode=${tx.cost_category_code}` : ""}`
                    : null;

                  return (
                    <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      {!projectId && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          {txProject ? (
                            <span className="font-mono text-[10px] text-muted-foreground">{txProject.code}</span>
                          ) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(tx.bill_date)}
                      </td>
                      <td className="px-3 py-2 font-medium">{tx.vendor_name}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
                        {tx.description ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        <span className="font-mono">{tx.gl_account_id || "—"}</span>
                        {tx.gl_account_name && (
                          <span className="ml-1 text-[10px]">{tx.gl_account_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        <span className="font-mono">{tx.cost_category_code ?? "—"}</span>
                        {tx.cost_category_name && (
                          <span className="ml-1 text-[10px]">{tx.cost_category_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
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
                      <td className="px-3 py-2 text-right tabular-nums text-green-700">
                        {detailBase ? (
                          <Link href={`${detailBase}&paymentFilter=paid`} className="hover:underline" title="View paid costs">
                            {usd(Number(tx.paid_amount))}
                          </Link>
                        ) : usd(Number(tx.paid_amount))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                        {Number(tx.unpaid_amount) !== 0 ? (
                          detailBase ? (
                            <Link href={`${detailBase}&paymentFilter=unpaid`} className="hover:underline" title="View unpaid costs">
                              {usd(Number(tx.unpaid_amount))}
                            </Link>
                          ) : usd(Number(tx.unpaid_amount))
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
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
                      <td className="px-3 py-2 text-muted-foreground">{tx.check_number ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{tx.reference_number ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
                  <td className="px-3 py-3" colSpan={!projectId ? 6 : 5}>
                    TOTAL — {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(totalInvoice)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(totalPaid)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {totalUnpaid !== 0 ? usd(totalUnpaid) : "—"}
                  </td>
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

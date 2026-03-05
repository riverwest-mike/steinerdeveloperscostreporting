export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ReportControls } from "./report-controls";
import { ArrowLeft } from "lucide-react";
import { ExportButtons } from "./export-buttons";

/* ─── Helpers ─────────────────────────────────────────── */

function today(): string {
  return new Date().toISOString().split("T")[0];
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

/* ─── Page ────────────────────────────────────────────── */

interface Props {
  searchParams: { projectId?: string; asOf?: string; categoryCode?: string };
}

export default async function CostDetailPage({ searchParams }: Props) {
  const projectId = searchParams.projectId ?? null;
  const asOf = searchParams.asOf ?? today();
  const categoryCode = searchParams.categoryCode ?? null;

  const supabase = createAdminClient();

  // Load projects and cost categories for controls
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

  const projects = (allProjects ?? []) as {
    id: string; name: string; code: string; appfolio_property_id: string | null;
  }[];
  const categories = (rawCategories ?? []) as { id: string; name: string; code: string }[];

  // ── No project selected ───────────────────────────────
  if (!projectId) {
    return (
      <div>
        <Header title="Cost Detail Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectId={null}
            currentAsOf={asOf}
            currentCategoryCode={null}
          />
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              Select a project and cost category above, then click Run Report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Load project ──────────────────────────────────────
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return (
      <div>
        <Header title="Cost Detail Report" />
        <div className="p-6">
          <ReportControls
            projects={projects}
            categories={categories}
            currentProjectId={projectId}
            currentAsOf={asOf}
            currentCategoryCode={categoryCode}
          />
          <p className="text-destructive text-sm">Project not found.</p>
        </div>
      </div>
    );
  }

  // ── Fetch AppFolio transactions ───────────────────────
  let transactions: Transaction[] = [];
  const noAppFolio = !project.appfolio_property_id;

  if (!noAppFolio) {
    let query = supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_bill_id, vendor_name, gl_account_id, gl_account_name, " +
        "cost_category_code, cost_category_name, bill_date, due_date, payment_date, " +
        "invoice_amount, paid_amount, unpaid_amount, payment_status, payment_type, " +
        "check_number, reference_number, description"
      )
      .eq("appfolio_property_id", project.appfolio_property_id)
      .or(`bill_date.lte.${asOf},bill_date.is.null`);

    if (categoryCode) {
      query = query.ilike("cost_category_code", categoryCode);
    }

    const { data: rawTx } = await query.order("bill_date", { ascending: false });
    transactions = (rawTx ?? []) as Transaction[];
  }

  // AppFolio base URL for bill deep-links (server-side only — env var never reaches client)
  const appfolioBaseUrl = process.env.APPFOLIO_DATABASE_URL
    ? `https://${process.env.APPFOLIO_DATABASE_URL}`
    : null;

  // ── Totals ────────────────────────────────────────────
  const totalInvoice = transactions.reduce((s, t) => s + Number(t.invoice_amount), 0);
  const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
  const totalUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);

  // ── Category label ────────────────────────────────────
  const selectedCategory = categoryCode
    ? categories.find((c) => c.code.toUpperCase() === categoryCode.toUpperCase())
    : null;

  const categoryLabel = selectedCategory
    ? `${selectedCategory.code} — ${selectedCategory.name}`
    : categoryCode ?? "All Categories";

  const backUrl = `/reports/cost-management?projectId=${projectId}&asOf=${asOf}`;

  return (
    <div>
      <Header title="Cost Detail Report" />
      <div className="p-6">
        <ReportControls
          projects={projects}
          categories={categories}
          currentProjectId={projectId}
          currentAsOf={asOf}
          currentCategoryCode={categoryCode}
        />

        {/* Report header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Cost Detail Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.code} — {project.name}
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
          <div className="flex items-center gap-2 shrink-0">
            {transactions.length > 0 && (
              <ExportButtons
                transactions={transactions}
                projectCode={project.code}
                projectName={project.name}
                categoryLabel={categoryLabel}
                asOf={asOf}
              />
            )}
            <Link
              href={backUrl}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to PCMR
            </Link>
          </div>
        </div>

        {noAppFolio && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            This project is not linked to an AppFolio property — no transaction data available.
          </div>
        )}

        {!noAppFolio && transactions.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              No AppFolio transactions found
              {categoryCode ? ` for cost category "${categoryCode}"` : ""}
              {" "}as of{" "}
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs border-collapse" style={{ minWidth: "1000px" }}>
              <thead>
                <tr className="bg-slate-800 text-white">
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
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                      {fmtDate(tx.bill_date)}
                    </td>
                    <td className="px-3 py-2 font-medium">{tx.vendor_name}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
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
                      ) : usd(Number(tx.invoice_amount))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-700">
                      {usd(Number(tx.paid_amount))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                      {Number(tx.unpaid_amount) !== 0 ? usd(Number(tx.unpaid_amount)) : "—"}
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
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
                  <td className="px-3 py-3" colSpan={5}>
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
        )}
      </div>
    </div>
  );
}

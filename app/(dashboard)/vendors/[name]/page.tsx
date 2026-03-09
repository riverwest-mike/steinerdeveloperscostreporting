export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

interface Props {
  params: Promise<{ name: string }>;
}

interface ProjectVendorRow {
  id: string;
  project_id: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function VendorProfilePage({ params }: Props) {
  const { name: encodedName } = await params;
  const vendorName = decodeURIComponent(encodedName);

  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");

  const { data: userRow } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (userRow as { role?: string } | null)?.role ?? "read_only";
  const canEdit = role === "admin" || role === "project_manager";

  // Fetch vendor records for this name across all projects
  const { data: rawVendors } = await supabase
    .from("project_vendors")
    .select("id, project_id, is_active, notes, created_at")
    .ilike("name", vendorName);

  const vendorRows = (rawVendors ?? []) as ProjectVendorRow[];
  if (vendorRows.length === 0) notFound();

  // For read_only users, filter to assigned projects
  let filteredRows = vendorRows;
  if (role === "read_only" && userId) {
    const { data: access } = await supabase
      .from("project_users")
      .select("project_id")
      .eq("user_id", userId);
    const allowed = new Set((access ?? []).map((a: { project_id: string }) => a.project_id));
    filteredRows = vendorRows.filter((v) => allowed.has(v.project_id));
    if (filteredRows.length === 0) notFound();
  }

  const projectIds = filteredRows.map((v) => v.project_id);

  const { data: rawProjects } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .in("id", projectIds)
    .order("name");

  const projects = (rawProjects ?? []) as ProjectRow[];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // Fetch transaction totals for this vendor across linked projects
  const propertyIds = projects
    .map((p) => p.appfolio_property_id)
    .filter((id): id is string => !!id);

  type TxTotals = {
    total_invoice: number;
    total_paid: number;
    total_unpaid: number;
    tx_count: number;
    last_bill_date: string | null;
    property_id: string;
  };

  const txTotalsByProperty = new Map<string, TxTotals>();
  let overallInvoice = 0;
  let overallPaid = 0;
  let overallUnpaid = 0;
  let overallTxCount = 0;
  let recentTransactions: {
    id: string;
    bill_date: string | null;
    invoice_amount: number;
    paid_amount: number;
    unpaid_amount: number;
    payment_status: string;
    description: string | null;
    gl_account_name: string;
    appfolio_property_id: string;
    appfolio_bill_id: string;
  }[] = [];

  if (propertyIds.length > 0) {
    const { data: rawTx } = await supabase
      .from("appfolio_transactions")
      .select(
        "id, appfolio_property_id, appfolio_bill_id, bill_date, invoice_amount, paid_amount, unpaid_amount, payment_status, description, gl_account_name"
      )
      .ilike("vendor_name", vendorName)
      .in("appfolio_property_id", propertyIds)
      .order("bill_date", { ascending: false });

    const txRows = (rawTx ?? []) as typeof recentTransactions;

    for (const tx of txRows) {
      overallInvoice += Number(tx.invoice_amount);
      overallPaid += Number(tx.paid_amount);
      overallUnpaid += Number(tx.unpaid_amount);
      overallTxCount++;

      if (!txTotalsByProperty.has(tx.appfolio_property_id)) {
        txTotalsByProperty.set(tx.appfolio_property_id, {
          total_invoice: 0,
          total_paid: 0,
          total_unpaid: 0,
          tx_count: 0,
          last_bill_date: null,
          property_id: tx.appfolio_property_id,
        });
      }
      const t = txTotalsByProperty.get(tx.appfolio_property_id)!;
      t.total_invoice += Number(tx.invoice_amount);
      t.total_paid += Number(tx.paid_amount);
      t.total_unpaid += Number(tx.unpaid_amount);
      t.tx_count++;
      if (!t.last_bill_date || (tx.bill_date && tx.bill_date > t.last_bill_date)) {
        t.last_bill_date = tx.bill_date;
      }
    }

    recentTransactions = txRows.slice(0, 10);
  }

  const propertyToProject = new Map<string, ProjectRow>();
  for (const p of projects) {
    if (p.appfolio_property_id) propertyToProject.set(p.appfolio_property_id, p);
  }

  const activeInProjects = filteredRows.filter((v) => v.is_active).length;
  const reportUrl = `/reports/vendor-detail?vendorName=${encodeURIComponent(vendorName)}`;

  return (
    <div>
      <Header title={vendorName} />
      <div className="p-4 sm:p-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{vendorName}</span>
        </nav>

        {/* Title + actions */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{vendorName}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Active in {activeInProjects} of {filteredRows.length} project{filteredRows.length !== 1 ? "s" : ""}.
            </p>
          </div>
          <Link
            href={reportUrl}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            View Transactions →
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Invoiced</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{usd(overallInvoice)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Paid</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-green-700">{usd(overallPaid)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Unpaid</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-amber-700">{usd(overallUnpaid)}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Transactions</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{overallTxCount}</p>
          </div>
        </div>

        {/* Projects */}
        <h3 className="text-base font-semibold mb-3">Projects</h3>
        <div className="rounded-lg border overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-medium">Project</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Invoiced</th>
                <th className="px-4 py-2.5 text-right font-medium">Transactions</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((vr) => {
                const project = projectById.get(vr.project_id);
                const propId = project?.appfolio_property_id;
                const totals = propId ? txTotalsByProperty.get(propId) : null;
                return (
                  <tr key={vr.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      {project ? (
                        <Link
                          href={`/projects/${vr.project_id}`}
                          className="font-medium hover:underline text-blue-600"
                        >
                          {project.code} — {project.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unknown project</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          vr.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {vr.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {totals ? usd(totals.total_invoice) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {totals ? totals.tx_count : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/reports/vendor-detail?projectIds=${vr.project_id}&vendorName=${encodeURIComponent(vendorName)}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Transactions
                        </Link>
                        {canEdit && (
                          <Link
                            href={`/projects/${vr.project_id}/vendors`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Manage
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent transactions */}
        {recentTransactions.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Recent Transactions</h3>
              <Link
                href={reportUrl}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all {overallTxCount} →
              </Link>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2.5 text-left font-medium">Date</th>
                    <th className="px-3 py-2.5 text-left font-medium">Project</th>
                    <th className="px-3 py-2.5 text-left font-medium">Description</th>
                    <th className="px-3 py-2.5 text-right font-medium">Invoice Amt</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => {
                    const project = propertyToProject.get(tx.appfolio_property_id);
                    return (
                      <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                          {tx.bill_date
                            ? new Date(tx.bill_date + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {project ? (
                            <span className="font-mono text-[10px] text-muted-foreground">{project.code}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                          {tx.description ?? tx.gl_account_name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {usd(Number(tx.invoice_amount))}
                        </td>
                        <td className="px-3 py-2">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {propertyIds.length === 0 && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            No AppFolio-linked projects — transaction data is not available for this vendor.
          </div>
        )}
      </div>
    </div>
  );
}

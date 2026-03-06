export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import {
  BarChart3,
  Receipt,
  Building2,
  FileText,
  ClipboardCheck,
  Scale,
  BookOpen,
  Package,
} from "lucide-react";
import { HELP } from "@/lib/help";
import { ReportingPackageButton } from "@/components/reporting-package-button";
import { createAdminClient } from "@/lib/supabase/server";

const AVAILABLE_REPORTS = [
  {
    href: "/reports/cost-management",
    title: "Project Cost Management Report",
    description:
      "Tracks original budget, authorized adjustments, commitments, and cost-to-date by cost category — all gates rolled up.",
    Icon: BarChart3,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50 group-hover:bg-blue-100",
  },
  {
    href: "/reports/cost-detail",
    title: "Cost Detail Report",
    description:
      "Transaction-level drill-down of AppFolio actuals for a selected project and cost category, pulled directly from AppFolio.",
    Icon: Receipt,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50 group-hover:bg-emerald-100",
  },
  {
    href: "/reports/vendor-detail",
    title: "Vendor Detail Report",
    description:
      "Look up all costs and transactions associated with a particular vendor — filter by project, vendor name, cost category, and date.",
    Icon: Building2,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50 group-hover:bg-violet-100",
  },
  {
    href: "/reports/commitment-detail",
    title: "Commitment Detail Report",
    description:
      "Lists every contract and its approved change orders by cost category — showing base amount, approved COs, and total committed.",
    Icon: FileText,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50 group-hover:bg-orange-100",
  },
  {
    href: "/reports/change-orders",
    title: "Change Order Log",
    description:
      "All change orders across projects and gates — filter by project, status, cost category, or date range. Export to Excel.",
    Icon: ClipboardCheck,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50 group-hover:bg-amber-100",
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet Report",
    description:
      "AppFolio balance sheet data by property — assets, liabilities, and equity as of a selected date.",
    Icon: Scale,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50 group-hover:bg-teal-100",
  },
  {
    href: "/reports/trial-balance",
    title: "Trial Balance",
    description:
      "All AppFolio transactions grouped by GL account for a selected project and date range — with invoice, paid, and unpaid totals.",
    Icon: BookOpen,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50 group-hover:bg-indigo-100",
  },
];

export default async function ReportingPage() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code")
    .order("name");

  // Split into two columns: first 4 in col 1, Reporting Package + remaining in col 2
  const col1 = AVAILABLE_REPORTS.slice(0, 4);
  const col2 = AVAILABLE_REPORTS.slice(4);

  return (
    <div>
      <Header title="Reporting" helpContent={HELP.reports} />
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight mb-1">Reporting</h2>
        <p className="text-muted-foreground mb-8">Select a report to run.</p>

        <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
          {/* Column 1 */}
          <div className="flex flex-col gap-4">
            {col1.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="group flex items-start gap-4 rounded-lg border p-5 hover:bg-accent hover:border-primary/30 transition-colors"
              >
                <div className={`mt-0.5 rounded-md border p-2 transition-colors shrink-0 ${report.iconBg}`}>
                  <report.Icon className={`h-5 w-5 ${report.iconColor} transition-colors`} />
                </div>
                <div>
                  <p className="font-semibold group-hover:text-primary transition-colors">
                    {report.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{report.description}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Column 2 — Reporting Package first, then remaining reports */}
          <div className="flex flex-col gap-4">
            {/* Reporting Package — launches a modal */}
            <div className="rounded-lg border p-5 flex items-start gap-4 hover:bg-accent hover:border-primary/30 transition-colors group">
              <div className="mt-0.5 rounded-md border p-2 transition-colors shrink-0 bg-rose-50 group-hover:bg-rose-100">
                <Package className="h-5 w-5 text-rose-600 transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold group-hover:text-primary transition-colors">
                  Reporting Package
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                  Generate the Project Cost Management Report and Balance Sheet together — export as a
                  single Excel workbook (two tabs) or open both as PDFs.
                </p>
                <ReportingPackageButton
                  projects={(projects ?? []) as { id: string; name: string; code: string }[]}
                />
              </div>
            </div>

            {col2.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="group flex items-start gap-4 rounded-lg border p-5 hover:bg-accent hover:border-primary/30 transition-colors"
              >
                <div className={`mt-0.5 rounded-md border p-2 transition-colors shrink-0 ${report.iconBg}`}>
                  <report.Icon className={`h-5 w-5 ${report.iconColor} transition-colors`} />
                </div>
                <div>
                  <p className="font-semibold group-hover:text-primary transition-colors">
                    {report.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{report.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

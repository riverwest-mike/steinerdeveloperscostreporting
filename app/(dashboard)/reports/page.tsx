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
  },
  {
    href: "/reports/cost-detail",
    title: "Cost Detail Report",
    description:
      "Transaction-level drill-down of AppFolio actuals for a selected project and cost category, pulled directly from AppFolio.",
    Icon: Receipt,
  },
  {
    href: "/reports/vendor-detail",
    title: "Vendor Detail Report",
    description:
      "Look up all costs and transactions associated with a particular vendor — filter by project, vendor name, cost category, and date.",
    Icon: Building2,
  },
  {
    href: "/reports/commitment-detail",
    title: "Commitment Detail Report",
    description:
      "Lists every contract and its approved change orders by cost category — showing base amount, approved COs, and total committed.",
    Icon: FileText,
  },
  {
    href: "/reports/change-orders",
    title: "Change Order Log",
    description:
      "All change orders across projects and gates — filter by project, status, cost category, or date range. Export to Excel.",
    Icon: ClipboardCheck,
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet Report",
    description:
      "AppFolio balance sheet data by property — assets, liabilities, and equity as of a selected date.",
    Icon: Scale,
  },
  {
    href: "/reports/trial-balance",
    title: "Trial Balance",
    description:
      "All AppFolio transactions grouped by GL account for a selected project and date range — with invoice, paid, and unpaid totals.",
    Icon: BookOpen,
  },
];

export default async function ReportsPage() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code")
    .order("name");

  return (
    <div>
      <Header title="Reports" helpContent={HELP.reports} />
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight mb-1">Reports</h2>
        <p className="text-muted-foreground mb-8">Select a report to run.</p>

        <div className="grid gap-4 max-w-2xl">
          {AVAILABLE_REPORTS.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="group flex items-start gap-4 rounded-lg border p-5 hover:bg-accent hover:border-primary/30 transition-colors"
            >
              <div className="mt-0.5 rounded-md border bg-background p-2 group-hover:border-primary/30 transition-colors shrink-0">
                <report.Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="font-semibold group-hover:text-primary transition-colors">
                  {report.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{report.description}</p>
              </div>
            </Link>
          ))}

          {/* Reporting Package — launches a modal */}
          <div className="rounded-lg border p-5 flex items-start gap-4 hover:bg-accent hover:border-primary/30 transition-colors group">
            <div className="mt-0.5 rounded-md border bg-background p-2 group-hover:border-primary/30 transition-colors shrink-0">
              <Package className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
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
        </div>
      </div>
    </div>
  );
}

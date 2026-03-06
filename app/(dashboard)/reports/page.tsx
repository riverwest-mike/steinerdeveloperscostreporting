export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { FileBarChart2 } from "lucide-react";
import { HELP } from "@/lib/help";

const AVAILABLE_REPORTS = [
  {
    href: "/reports/cost-management",
    title: "Project Cost Management Report",
    description:
      "Tracks original budget, authorized adjustments, commitments, and cost-to-date by cost category — all gates rolled up.",
  },
  {
    href: "/reports/cost-detail",
    title: "Cost Detail Report",
    description:
      "Transaction-level drill-down of AppFolio actuals for a selected project and cost category, pulled directly from AppFolio.",
  },
  {
    href: "/reports/vendor-detail",
    title: "Vendor Detail Report",
    description:
      "Look up all costs and transactions associated with a particular vendor — filter by project, vendor name, cost category, and date.",
  },
  {
    href: "/reports/commitment-detail",
    title: "Commitment Detail Report",
    description:
      "Lists every contract and its approved change orders by cost category — showing base amount, approved COs, and total committed.",
  },
  {
    href: "/reports/change-orders",
    title: "Change Order Log",
    description:
      "All change orders across projects and gates — filter by project, status, cost category, or date range. Export to Excel.",
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance Sheet Report",
    description:
      "AppFolio balance sheet data by property — assets, liabilities, and equity as of a selected date.",
  },
];

export default function ReportsPage() {
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
              <div className="mt-0.5 rounded-md border bg-background p-2 group-hover:border-primary/30 transition-colors">
                <FileBarChart2 className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
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
  );
}

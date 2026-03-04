export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { FileBarChart2 } from "lucide-react";

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
];

export default function ReportsPage() {
  return (
    <div>
      <Header title="Reports" />
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

import { Header } from "@/components/layout/header";
import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div>
      <Header title="Reports" />
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight mb-1">Reports</h2>
        <p className="text-muted-foreground mb-8">
          Project cost summaries and exports.
        </p>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm font-medium text-muted-foreground">Reports coming soon</p>
        </div>
      </div>
    </div>
  );
}

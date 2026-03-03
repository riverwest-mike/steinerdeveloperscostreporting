export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { BarChart3 } from "lucide-react";

export default async function ReportsPage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .order("name")
    .limit(1);

  if (projects && projects.length > 0) {
    redirect(`/reports/${projects[0].id}`);
  }

  return (
    <div>
      <Header title="Reports" />
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight mb-1">Reports</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center mt-6">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">No projects available. Add a project to get started.</p>
        </div>
      </div>
    </div>
  );
}

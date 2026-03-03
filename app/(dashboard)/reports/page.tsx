export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { BarChart3 } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

export default async function ReportsPage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, city, state")
    .order("name");

  return (
    <div>
      <Header title="Reports" />
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight mb-1">Reports</h2>
        <p className="text-muted-foreground mb-6">Select a project to view its cost category report.</p>

        {projects && projects.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            {projects.map((project: { id: string; name: string; code: string; status: string; city: string | null; state: string | null }) => (
              <Link
                key={project.id}
                href={`/reports/${project.id}`}
                className="rounded-lg border p-4 hover:bg-accent hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status] ?? "bg-gray-100 text-gray-800"}`}>
                    {project.status.replace("_", " ")}
                  </span>
                </div>
                <p className="font-semibold group-hover:text-primary transition-colors">{project.name}</p>
                {(project.city || project.state) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {[project.city, project.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground">No projects available.</p>
          </div>
        )}
      </div>
    </div>
  );
}

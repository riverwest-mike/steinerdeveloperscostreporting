export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

export default async function ProjectsPage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, property_type, city, state, expected_completion")
    .order("name");

  return (
    <div>
      <Header title="Projects" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">All Projects</h2>
          <Link
            href="/projects/new"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New Project
          </Link>
        </div>

        {projects && projects.length > 0 ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Location</th>
                  <th className="px-4 py-3 text-left font-medium">Est. Completion</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project: { id: string; name: string; code: string; status: string; property_type: string | null; city: string | null; state: string | null; expected_completion: string | null }) => (
                  <tr key={project.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{project.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {project.property_type ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[project.city, project.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {project.expected_completion
                        ? new Date(project.expected_completion).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          project.status === "active"
                            ? "bg-green-100 text-green-800"
                            : project.status === "on_hold"
                            ? "bg-yellow-100 text-yellow-800"
                            : project.status === "completed"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-3">No projects have been created yet.</p>
            <Link
              href="/projects/new"
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create your first project
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

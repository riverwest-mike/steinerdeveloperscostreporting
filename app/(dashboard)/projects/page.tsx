export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-800",
};

interface Props {
  searchParams: { status?: string };
}

export default async function ProjectsPage({ searchParams }: Props) {
  const supabase = createAdminClient();
  const statusFilter = searchParams.status ?? "";

  let query = supabase
    .from("projects")
    .select("id, name, code, status, property_type, city, state, expected_completion, image_url")
    .order("name");

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: projects } = await query;

  // Count per status for tab badges
  const { data: counts } = await supabase
    .from("projects")
    .select("status");

  const countByStatus = new Map<string, number>();
  for (const p of counts ?? []) {
    countByStatus.set(p.status, (countByStatus.get(p.status) ?? 0) + 1);
  }
  const totalCount = counts?.length ?? 0;

  return (
    <div>
      <Header title="Projects" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold tracking-tight">Projects</h2>
          <Link
            href="/projects/new"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New Project
          </Link>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 mb-5 border-b">
          {STATUS_OPTIONS.map((opt) => {
            const count = opt.value ? (countByStatus.get(opt.value) ?? 0) : totalCount;
            const isActive = statusFilter === opt.value;
            return (
              <Link
                key={opt.value}
                href={opt.value ? `/projects?status=${opt.value}` : "/projects"}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {opt.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {projects && projects.length > 0 ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-14 px-4 py-3"></th>
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Location</th>
                  <th className="px-4 py-3 text-left font-medium">Est. Completion</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {project.image_url ? (
                        <img src={project.image_url} alt="" className="h-10 w-10 rounded object-cover border" />
                      ) : (
                        <div className="h-10 w-10 rounded border bg-muted/50 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-mono text-muted-foreground">{project.code.slice(0, 3)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{project.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/projects/${project.id}`} className="hover:text-primary hover:underline underline-offset-2 transition-colors">
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{project.property_type ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[project.city, project.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {project.expected_completion
                        ? new Date(project.expected_completion).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status] ?? "bg-gray-100 text-gray-800"}`}>
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
            <p className="text-muted-foreground mb-3">
              {statusFilter
                ? `No ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label.toLowerCase()} projects.`
                : "No projects have been created yet."}
            </p>
            {!statusFilter && (
              <Link href="/projects/new" className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Create your first project
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

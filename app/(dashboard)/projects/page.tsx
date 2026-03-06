export const dynamic = "force-dynamic";

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { MapPin, CalendarDays, Building2 } from "lucide-react";
import { HELP } from "@/lib/help";

interface Project {
  id: string;
  name: string;
  code: string;
  status: string;
  property_type: string | null;
  city: string | null;
  state: string | null;
  expected_completion: string | null;
  image_url: string | null;
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

const STATUS_STRIPE: Record<string, string> = {
  active: "bg-green-500",
  on_hold: "bg-yellow-400",
  completed: "bg-blue-500",
  archived: "bg-gray-300",
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

  const { data: rawProjects } = await query;
  const projects = (rawProjects ?? []) as Project[];

  // Count per status for tab badges
  const { data: rawCounts } = await supabase.from("projects").select("status");
  const counts = (rawCounts ?? []) as { status: string }[];
  const countByStatus = new Map<string, number>();
  for (const p of counts) {
    countByStatus.set(p.status, (countByStatus.get(p.status) ?? 0) + 1);
  }
  const totalCount = counts.length;

  return (
    <div>
      <Header title="Projects" helpContent={HELP.projects} />
      <div className="p-4 sm:p-6">
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
        <div className="flex items-center gap-1 mb-6 border-b overflow-x-auto">
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
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const location = [project.city, project.state].filter(Boolean).join(", ");
              const stripe = STATUS_STRIPE[project.status] ?? "bg-gray-300";
              const badge = STATUS_BADGE[project.status] ?? "bg-gray-100 text-gray-500";
              const completion = project.expected_completion
                ? new Date(project.expected_completion + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })
                : null;

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex flex-col rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden"
                >
                  {/* Status stripe */}
                  <div className={`h-1 w-full ${stripe}`} />

                  <div className="flex items-start gap-3 p-4">
                    {/* Image or code badge */}
                    {project.image_url ? (
                      <img
                        src={project.image_url}
                        alt=""
                        className="h-12 w-12 rounded-md object-cover border shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-md border bg-muted/60 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-mono font-semibold text-muted-foreground leading-tight text-center px-0.5">
                          {project.code.slice(0, 6)}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-muted-foreground leading-none mb-0.5">
                            {project.code}
                          </p>
                          <p className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                            {project.name}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${badge}`}
                        >
                          {project.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div className="px-4 pb-4 pt-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t mx-4 mt-0 pt-3">
                    {project.property_type && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {project.property_type}
                      </span>
                    )}
                    {location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {location}
                      </span>
                    )}
                    {completion && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        Est. {completion}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground mb-3">
              {statusFilter
                ? `No ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label.toLowerCase()} projects.`
                : "No projects have been created yet."}
            </p>
            {!statusFilter && (
              <Link
                href="/projects/new"
                className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Create your first project
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

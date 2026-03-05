export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { AuditLogFilters } from "./audit-log-filters";
import { LocalTime } from "@/components/local-time";

const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  "project.create":        "Created project",
  "project.update":        "Updated project",
  "project.delete":        "Deleted project",
  "gate.create":           "Created gate",
  "gate.update":           "Updated gate",
  "gate.delete":           "Deleted gate",
  "gate.activate":         "Activated gate",
  "gate.close":            "Closed gate",
  "contract.create":       "Created contract",
  "contract.update":       "Updated contract",
  "contract.delete":       "Deleted contract",
  "change_order.create":   "Proposed change order",
  "change_order.approve":  "Approved change order",
  "change_order.reject":   "Rejected change order",
  "change_order.void":     "Voided change order",
};

const ACTION_COLORS: Record<string, string> = {
  "project.create":        "bg-green-100 text-green-800",
  "project.update":        "bg-blue-100 text-blue-800",
  "project.delete":        "bg-red-100 text-red-700",
  "gate.create":           "bg-green-100 text-green-800",
  "gate.update":           "bg-blue-100 text-blue-800",
  "gate.delete":           "bg-red-100 text-red-700",
  "gate.activate":         "bg-emerald-100 text-emerald-800",
  "gate.close":            "bg-slate-100 text-slate-700",
  "contract.create":       "bg-green-100 text-green-800",
  "contract.update":       "bg-blue-100 text-blue-800",
  "contract.delete":       "bg-red-100 text-red-700",
  "change_order.create":   "bg-yellow-100 text-yellow-800",
  "change_order.approve":  "bg-green-100 text-green-800",
  "change_order.reject":   "bg-red-100 text-red-700",
  "change_order.void":     "bg-gray-100 text-gray-600",
};

interface SearchParams {
  userId?: string;
  projectId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}

interface Props {
  searchParams: SearchParams;
}

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  label: string | null;
  payload: Record<string, unknown> | null;
}

export default async function AuditLogPage({ searchParams }: Props) {
  const { userId: authUserId } = await auth();
  const supabase = createAdminClient();

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUserId!)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  // Build query
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (searchParams.userId)    query = query.eq("user_id", searchParams.userId);
  if (searchParams.projectId) query = query.eq("project_id", searchParams.projectId);
  if (searchParams.action)    query = query.eq("action", searchParams.action);
  if (searchParams.from)      query = query.gte("created_at", searchParams.from);
  if (searchParams.to)        query = query.lte("created_at", searchParams.to + "T23:59:59Z");

  const [
    { data: logs, count },
    { data: allUsers },
    { data: allProjects },
  ] = await Promise.all([
    query,
    supabase.from("users").select("id, full_name, email").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
  ]);

  const userMap = new Map<string, { id: string; full_name: string; email: string }>(
    ((allUsers ?? []) as { id: string; full_name: string; email: string }[]).map((u) => [u.id, u])
  );
  const projectMap = new Map<string, { id: string; name: string; code: string }>(
    ((allProjects ?? []) as { id: string; name: string; code: string }[]).map((p) => [p.id, p])
  );

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const hasFilters = !!(searchParams.userId || searchParams.projectId || searchParams.action || searchParams.from || searchParams.to);

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (searchParams.userId)    params.set("userId", searchParams.userId);
    if (searchParams.projectId) params.set("projectId", searchParams.projectId);
    if (searchParams.action)    params.set("action", searchParams.action);
    if (searchParams.from)      params.set("from", searchParams.from);
    if (searchParams.to)        params.set("to", searchParams.to);
    if (p > 1)                  params.set("page", String(p));
    const qs = params.toString();
    return `/admin/audit-log${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <Header title="Audit Log" />
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            All user-initiated changes across projects, gates, contracts, and change orders.
          </p>
        </div>

        <AuditLogFilters
          users={(allUsers ?? []) as { id: string; full_name: string; email: string }[]}
          projects={(allProjects ?? []) as { id: string; name: string; code: string }[]}
        />

        {/* Summary */}
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {count === 0
              ? "No entries found"
              : `${count?.toLocaleString()} entr${count === 1 ? "y" : "ies"}${hasFilters ? " matching filters" : ""} — showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, count ?? 0)}`}
          </span>
          {totalPages > 1 && (
            <span>Page {page} of {totalPages}</span>
          )}
        </div>

        {(logs ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground text-sm">
              {hasFilters ? "No entries match the selected filters." : "No audit log entries yet. Changes will appear here as users make them."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(logs as AuditRow[]).map((row) => {
                  const user = userMap.get(row.user_id);
                  const project = row.project_id ? projectMap.get(row.project_id) : null;
                  const actionLabel = ACTION_LABELS[row.action] ?? row.action;
                  const actionColor = ACTION_COLORS[row.action] ?? "bg-gray-100 text-gray-600";

                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        <LocalTime iso={row.created_at} timeClassName="text-[10px]" />
                      </td>
                      <td className="px-4 py-3">
                        {user ? (
                          <div>
                            <div className="font-medium text-sm">{user.full_name}</div>
                            <div className="text-xs text-muted-foreground">{user.email}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">{row.user_id.slice(0, 12)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionColor}`}>
                          {actionLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {project ? (
                          <span>
                            <span className="font-mono mr-1">{project.code}</span>
                            {project.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.label && <span className="font-medium">{row.label}</span>}
                        {row.payload && Object.keys(row.payload).length > 0 && (
                          <div className="mt-0.5 text-muted-foreground">
                            {Object.entries(row.payload)
                              .filter(([, v]) => v !== null && v !== undefined && v !== "")
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </div>
                        )}
                        {!row.label && (!row.payload || Object.keys(row.payload).length === 0) && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center gap-2 justify-center text-sm">
            {page > 1 && (
              <a
                href={buildPageUrl(page - 1)}
                className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                ← Previous
              </a>
            )}
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            {page < totalPages && (
              <a
                href={buildPageUrl(page + 1)}
                className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

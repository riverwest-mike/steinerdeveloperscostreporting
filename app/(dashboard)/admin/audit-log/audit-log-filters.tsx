"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface User { id: string; full_name: string; email: string }
interface Project { id: string; name: string; code: string }

const ACTION_LABELS: Record<string, string> = {
  "project.create":        "Created project",
  "project.update":        "Updated project",
  "project.delete":        "Deleted project",
  "project.link_appfolio": "Linked AppFolio ID",
  "gate.create":           "Created gate",
  "gate.update":           "Updated gate",
  "gate.delete":           "Deleted gate",
  "gate.activate":         "Activated gate",
  "gate.close":            "Closed gate",
  "gate.upload_bulk":      "Bulk gate upload",
  "gate.budget_update":    "Updated gate budget",
  "contract.create":       "Created contract",
  "contract.update":       "Updated contract",
  "contract.delete":       "Deleted contract",
  "change_order.create":   "Proposed change order",
  "change_order.update":   "Updated change order",
  "change_order.approve":  "Approved change order",
  "change_order.reject":   "Rejected change order",
  "change_order.void":     "Voided change order",
};

const ACTION_GROUPS = [
  { label: "Projects", values: ["project.create", "project.update", "project.delete", "project.link_appfolio"] },
  { label: "Gates", values: ["gate.create", "gate.update", "gate.delete", "gate.activate", "gate.close", "gate.upload_bulk", "gate.budget_update"] },
  { label: "Contracts", values: ["contract.create", "contract.update", "contract.delete"] },
  { label: "Change Orders", values: ["change_order.create", "change_order.update", "change_order.approve", "change_order.reject", "change_order.void"] },
];

export function AuditLogFilters({
  users,
  projects,
}: {
  users: User[];
  projects: Project[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [userId, setUserId] = useState(sp.get("userId") ?? "");
  const [projectId, setProjectId] = useState(sp.get("projectId") ?? "");
  const [action, setAction] = useState(sp.get("action") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (projectId) params.set("projectId", projectId);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/admin/audit-log?${params.toString()}`);
  }

  function reset() {
    setUserId(""); setProjectId(""); setAction(""); setFrom(""); setTo("");
    router.push("/admin/audit-log");
  }

  const hasFilters = userId || projectId || action || from || to;

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm min-w-44"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm min-w-44"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm min-w-48"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.values.map((v) => (
                  <option key={v} value={v}>{ACTION_LABELS[v] ?? v}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          />
        </div>

        <div className="flex gap-2 pb-0.5">
          <button
            onClick={apply}
            className="h-8 rounded bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
          {hasFilters && (
            <button
              onClick={reset}
              className="h-8 rounded border px-4 text-sm font-medium hover:bg-accent transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

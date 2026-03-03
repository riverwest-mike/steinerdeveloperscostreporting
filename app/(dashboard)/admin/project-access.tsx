"use client";

import { useState, useTransition } from "react";
import { assignUserToProject, removeUserFromProject } from "./actions";

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Assignment {
  project_id: string;
  user_id: string;
}

interface ProjectAccessSectionProps {
  projects: Project[];
  users: User[];
  assignments: Assignment[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  project_manager: "PM",
  read_only: "Read Only",
};

export function ProjectAccessSection({
  projects,
  users,
  assignments,
}: ProjectAccessSectionProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Build a map: project_id → set of user_ids
  const assignmentMap = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!assignmentMap.has(a.project_id)) assignmentMap.set(a.project_id, new Set());
    assignmentMap.get(a.project_id)!.add(a.user_id);
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Project Access</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Control which users can see each project. Admins have access to all projects by default.
      </p>
      <div className="rounded-lg border divide-y">
        {projects.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No projects yet.</div>
        )}
        {projects.map((project) => {
          const assigned = assignmentMap.get(project.id) ?? new Set<string>();
          const assignedUsers = users.filter((u) => assigned.has(u.id));
          const isOpen = expandedProject === project.id;

          return (
            <div key={project.id}>
              <button
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpandedProject(isOpen ? null : project.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                  <span className="font-medium text-sm">{project.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {assignedUsers.length} user{assignedUsers.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <ProjectUserPanel
                  project={project}
                  allUsers={users}
                  assignedUserIds={assigned}
                  assignedUsers={assignedUsers}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectUserPanel({
  project,
  allUsers,
  assignedUserIds,
  assignedUsers,
}: {
  project: Project;
  allUsers: User[];
  assignedUserIds: Set<string>;
  assignedUsers: User[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const unassignedUsers = allUsers.filter(
    (u) => !assignedUserIds.has(u.id) && u.role !== "admin"
  );

  function handleAssign() {
    if (!selectedUserId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignUserToProject(selectedUserId, project.id);
      if (result?.error) { setError(result.error); return; }
      setSelectedUserId("");
    });
  }

  function handleRemove(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeUserFromProject(userId, project.id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="px-4 pb-4 pt-1 bg-muted/10 border-t space-y-3">
      <p className="text-xs text-muted-foreground">
        Admins always have access. Assign PMs and read-only users below.
      </p>

      {/* Assigned users */}
      {assignedUsers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {assignedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{u.full_name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{ROLE_LABELS[u.role] ?? u.role}</span>
              <button
                disabled={isPending}
                onClick={() => handleRemove(u.id)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                title={`Remove ${u.full_name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No users assigned yet.</p>
      )}

      {/* Add user */}
      {unassignedUsers.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={isPending}
            className="rounded border border-input bg-background px-2 py-1 text-xs flex-1 max-w-xs disabled:opacity-50"
          >
            <option value="">— Add a user —</option>
            {unassignedUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({ROLE_LABELS[u.role] ?? u.role})
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selectedUserId || isPending}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "…" : "Add"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

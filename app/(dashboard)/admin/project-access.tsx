"use client";

import { useState, useTransition } from "react";
import {
  assignUserToProject,
  removeUserFromProject,
  assignPendingInviteToProject,
  removePendingInviteFromProject,
} from "./actions";

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

interface PendingInvite {
  id: string;
  emailAddress: string;
  role: string;
}

interface PendingAssignment {
  invite_email: string;
  project_id: string;
}

interface ProjectAccessSectionProps {
  projects: Project[];
  users: User[];
  assignments: Assignment[];
  pendingInvites: PendingInvite[];
  pendingAssignments: PendingAssignment[];
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
  pendingInvites,
  pendingAssignments,
}: ProjectAccessSectionProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // project_id → Set<user_id>
  const assignmentMap = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!assignmentMap.has(a.project_id)) assignmentMap.set(a.project_id, new Set());
    assignmentMap.get(a.project_id)!.add(a.user_id);
  }

  // project_id → Set<invite_email>
  const pendingAssignmentMap = new Map<string, Set<string>>();
  for (const a of pendingAssignments) {
    if (!pendingAssignmentMap.has(a.project_id)) pendingAssignmentMap.set(a.project_id, new Set());
    pendingAssignmentMap.get(a.project_id)!.add(a.invite_email);
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Project Access</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Control which users can see each project. Admins have access to all projects by default.
        Pending invites can be assigned before the user accepts.
      </p>
      <div className="rounded-lg border divide-y">
        {projects.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No projects yet.</div>
        )}
        {projects.map((project) => {
          const assigned = assignmentMap.get(project.id) ?? new Set<string>();
          const assignedPendingEmails = pendingAssignmentMap.get(project.id) ?? new Set<string>();
          const assignedUsers = users.filter((u) => assigned.has(u.id));
          const assignedPendingInvites = pendingInvites.filter((inv) =>
            assignedPendingEmails.has(inv.emailAddress)
          );
          const totalCount = assignedUsers.length + assignedPendingInvites.length;
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
                    {totalCount} user{totalCount !== 1 ? "s" : ""}
                    {assignedPendingInvites.length > 0 && (
                      <span className="ml-1 text-amber-600">
                        ({assignedPendingInvites.length} pending)
                      </span>
                    )}
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
                  allPendingInvites={pendingInvites}
                  assignedPendingEmails={assignedPendingEmails}
                  assignedPendingInvites={assignedPendingInvites}
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
  allPendingInvites,
  assignedPendingEmails,
  assignedPendingInvites,
}: {
  project: Project;
  allUsers: User[];
  assignedUserIds: Set<string>;
  assignedUsers: User[];
  allPendingInvites: PendingInvite[];
  assignedPendingEmails: Set<string>;
  assignedPendingInvites: PendingInvite[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Value format: "user:<userId>" or "invite:<email>"
  const [selected, setSelected] = useState("");

  const unassignedUsers = allUsers.filter(
    (u) => !assignedUserIds.has(u.id) && u.role !== "admin"
  );
  const unassignedPendingInvites = allPendingInvites.filter(
    (inv) => !assignedPendingEmails.has(inv.emailAddress)
  );
  const hasUnassigned = unassignedUsers.length > 0 || unassignedPendingInvites.length > 0;

  function handleAssign() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      let result: { error?: string };
      if (selected.startsWith("user:")) {
        result = await assignUserToProject(selected.slice(5), project.id);
      } else {
        result = await assignPendingInviteToProject(selected.slice(7), project.id);
      }
      if (result?.error) { setError(result.error); return; }
      setSelected("");
    });
  }

  function handleRemoveUser(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeUserFromProject(userId, project.id);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemovePendingInvite(email: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePendingInviteFromProject(email, project.id);
      if (result?.error) setError(result.error);
    });
  }

  const hasAnyAssigned = assignedUsers.length > 0 || assignedPendingInvites.length > 0;

  return (
    <div className="px-4 pb-4 pt-1 bg-muted/10 border-t space-y-3">
      <p className="text-xs text-muted-foreground">
        Admins always have access. Assign PMs, read-only users, and pending invites below.
      </p>

      {/* Assigned users + pending invites */}
      {hasAnyAssigned ? (
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
                onClick={() => handleRemoveUser(u.id)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                title={`Remove ${u.full_name}`}
              >
                ×
              </button>
            </span>
          ))}
          {assignedPendingInvites.map((inv) => (
            <span
              key={inv.emailAddress}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{inv.emailAddress}</span>
              <span className="text-amber-600/60">·</span>
              <span className="text-amber-700">{ROLE_LABELS[inv.role] ?? inv.role}</span>
              <span className="text-amber-600/60">·</span>
              <span className="italic text-amber-600 text-[10px]">invited</span>
              <button
                disabled={isPending}
                onClick={() => handleRemovePendingInvite(inv.emailAddress)}
                className="ml-1 text-amber-500 hover:text-destructive transition-colors disabled:opacity-50"
                title={`Remove ${inv.emailAddress}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No users assigned yet.</p>
      )}

      {/* Add user or pending invite */}
      {hasUnassigned && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={isPending}
            className="rounded border border-input bg-background px-2 py-1 text-xs flex-1 max-w-xs disabled:opacity-50"
          >
            <option value="">— Add a user —</option>
            {unassignedUsers.length > 0 && (
              <optgroup label="Active users">
                {unassignedUsers.map((u) => (
                  <option key={u.id} value={`user:${u.id}`}>
                    {u.full_name} ({ROLE_LABELS[u.role] ?? u.role})
                  </option>
                ))}
              </optgroup>
            )}
            {unassignedPendingInvites.length > 0 && (
              <optgroup label="Pending invites">
                {unassignedPendingInvites.map((inv) => (
                  <option key={inv.emailAddress} value={`invite:${inv.emailAddress}`}>
                    {inv.emailAddress} ({ROLE_LABELS[inv.role] ?? inv.role}) — invited
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selected || isPending}
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

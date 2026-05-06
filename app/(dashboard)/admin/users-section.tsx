"use client";

import { useState, useTransition } from "react";
import { useConfirmDestructive } from "@/components/confirm-destructive";
import { RoleSelect } from "./role-select";
import { ActiveToggle } from "./active-toggle";
import { InviteUserForm } from "./invite-user-form";
import { revokeInvite, assignUserToProject, removeUserFromProject, syncClerkUsers } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface PendingInvite {
  id: string;
  emailAddress: string;
  role: string;
  createdAt: number;
  status: string;
  projectIds: string[];
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

interface UsersSectionProps {
  users: User[];
  currentUserId: string;
  pendingInvites?: PendingInvite[];
  projects?: Project[];
  assignments?: Assignment[];
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

// Excel SVG icon matching the style used elsewhere in the app
function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 13l2.5 4M13.5 13 11 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function UserProjectCell({
  user,
  projects,
  assignedProjectIds,
}: {
  user: User;
  projects: Project[];
  assignedProjectIds: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");

  // Admins and development leads have access to all projects by default
  if (user.role === "admin" || user.role === "development_lead") {
    return (
      <span className="text-xs text-muted-foreground italic">All projects ({user.role === "admin" ? "Admin" : "Development Lead"})</span>
    );
  }

  const assignedProjects = projects.filter((p) => assignedProjectIds.has(p.id));
  const unassignedProjects = projects.filter((p) => !assignedProjectIds.has(p.id));

  function handleRemove(projectId: string) {
    startTransition(async () => {
      await removeUserFromProject(user.id, projectId);
    });
  }

  function handleAdd() {
    if (!selectedProject) return;
    startTransition(async () => {
      await assignUserToProject(user.id, selectedProject);
      setSelectedProject("");
      setAdding(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-[160px]">
      {assignedProjects.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary border border-primary/20"
        >
          <span className="font-mono opacity-60 text-[10px]">{p.code}</span>
          <span>{p.name}</span>
          <button
            disabled={isPending}
            onClick={() => handleRemove(p.id)}
            className="ml-0.5 text-primary/50 hover:text-destructive transition-colors disabled:opacity-50 leading-none"
            title={`Remove from ${p.name}`}
          >
            ×
          </button>
        </span>
      ))}

      {unassignedProjects.length > 0 && (
        adding ? (
          <div className="flex items-center gap-1 mt-1">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={isPending}
              className="rounded border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— pick project —</option>
              {unassignedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} – {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedProject || isPending}
              className="rounded px-1.5 py-0.5 text-xs bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedProject(""); }}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={isPending}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
            title="Assign to a project"
          >
            + Project
          </button>
        )
      )}

      {assignedProjects.length === 0 && unassignedProjects.length === 0 && (
        <span className="text-xs text-muted-foreground italic">No projects</span>
      )}
    </div>
  );
}

export function UsersSection({
  users,
  currentUserId,
  pendingInvites = [],
  projects = [],
  assignments = [],
}: UsersSectionProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const confirmDestructive = useConfirmDestructive();

  // Build user → project assignment map
  const userProjectMap = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!userProjectMap.has(a.user_id)) userProjectMap.set(a.user_id, new Set());
    userProjectMap.get(a.user_id)!.add(a.project_id);
  }

  const filteredUsers = users.filter((u) => {
    if (statusFilter === "active") return u.is_active;
    if (statusFilter === "inactive") return !u.is_active;
    return true;
  });

  function handleSyncClerk() {
    setSyncMsg(null);
    setSyncing(true);
    startTransition(async () => {
      const result = await syncClerkUsers();
      setSyncing(false);
      if (result.error) {
        setSyncMsg({ tone: "error", text: `Sync failed: ${result.error}` });
      } else {
        const n = result.created ?? 0;
        setSyncMsg({
          tone: "ok",
          text: n === 0
            ? "Already up to date — no new users in Clerk."
            : `Synced ${n} new user${n === 1 ? "" : "s"} from Clerk.`,
        });
      }
    });
  }

  async function handleRevoke(inviteId: string, email: string) {
    const reason = await confirmDestructive({
      title: `Revoke invitation for ${email}?`,
      body: "They will no longer be able to use this invite link.",
      confirmLabel: "Revoke invite",
    });
    if (reason === null) return;
    setRevokeError(null);
    setRevoking(inviteId);
    startTransition(async () => {
      const result = await revokeInvite(inviteId, email);
      if (result.error) setRevokeError(result.error);
      setRevoking(null);
    });
  }

  function handleExportToExcel() {
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();

      // Users sheet — includes project access
      const userRows = users.map((u) => {
        const assignedIds = userProjectMap.get(u.id) ?? new Set<string>();
        const assignedProjectNames = (u.role === "admin" || u.role === "development_lead")
          ? `All Projects (${u.role === "admin" ? "Admin" : "Development Lead"})`
          : projects
              .filter((p) => assignedIds.has(p.id))
              .map((p) => `${p.code} – ${p.name}`)
              .join(", ") || "None";

        return {
          "Name": u.full_name,
          "Email": u.email,
          "Role": u.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          "Status": u.is_active ? "Active" : "Inactive",
          "Project Access": assignedProjectNames,
          "Joined": new Date(u.created_at).toLocaleDateString(),
        };
      });

      const wsUsers = XLSX.utils.json_to_sheet(userRows);
      wsUsers["!cols"] = [
        { wch: 28 },
        { wch: 34 },
        { wch: 18 },
        { wch: 10 },
        { wch: 50 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, wsUsers, "Users");

      // Pending Invitations sheet
      if (pendingInvites.length > 0) {
        const pendingRows = pendingInvites.map((inv) => {
          const assignedProjectNames = projects
            .filter((p) => inv.projectIds.includes(p.id))
            .map((p) => `${p.code} – ${p.name}`)
            .join(", ") || "None";
          return {
            "Email": inv.emailAddress,
            "Role": inv.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            "Project Access": assignedProjectNames,
            "Invited": new Date(inv.createdAt).toLocaleDateString(),
            "Status": "Pending",
          };
        });

        const wsPending = XLSX.utils.json_to_sheet(pendingRows);
        wsPending["!cols"] = [
          { wch: 34 },
          { wch: 18 },
          { wch: 50 },
          { wch: 14 },
          { wch: 10 },
        ];
        XLSX.utils.book_append_sheet(wb, wsPending, "Pending Invitations");
      }

      XLSX.writeFile(wb, "users-and-access.xlsx");
    });
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Users & Access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage accounts, roles, and project assignments in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportToExcel}
            disabled={users.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <ExcelIcon className="h-4 w-4 text-green-600" />
            Export to Excel
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncClerk}
            disabled={syncing}
            title="Pull users created directly in Clerk into this app's user list"
          >
            {syncing ? "Syncing…" : "Sync from Clerk"}
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            + Add User
          </Button>
        </div>
      </div>

      {syncMsg && (
        <div
          className={`px-5 py-2 text-xs border-b ${
            syncMsg.tone === "error"
              ? "bg-destructive/5 text-destructive"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {syncMsg.text}
        </div>
      )}

      {/* Status filter */}
      <div className="px-5 py-3 border-b flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm kiln-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Project Access</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium whitespace-nowrap">{u.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.email}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary capitalize">
                    {u.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <UserProjectCell
                    user={u}
                    projects={projects}
                    assignedProjectIds={userProjectMap.get(u.id) ?? new Set()}
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <ActiveToggle
                    userId={u.id}
                    isActive={u.is_active}
                    isSelf={u.id === currentUserId}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RoleSelect
                    userId={u.id}
                    currentRole={u.role as "admin" | "project_manager" | "read_only" | "accounting"}
                    isSelf={u.id === currentUserId}
                  />
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No users match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 text-xs text-muted-foreground border-t">
        Users appear here after accepting an invitation and completing sign-up. Click the Status badge to activate or deactivate — you cannot change your own. Admins automatically have access to all projects.
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="border-t">
          <div className="px-5 py-3 flex items-center gap-2">
            <h4 className="text-sm font-semibold">Pending Invitations</h4>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
              {pendingInvites.length}
            </span>
          </div>
          {revokeError && (
            <p className="px-5 pb-2 text-xs text-destructive">{revokeError}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm kiln-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Project Access</th>
                  <th>Invited</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => {
                  const assignedProjects = projects.filter((p) => inv.projectIds.includes(p.id));
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{inv.emailAddress}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground capitalize">
                          {inv.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {assignedProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedProjects.map((p) => (
                              <span key={p.id} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="font-mono mr-1 opacity-60 text-[10px]">{p.code}</span>{p.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(inv.id, inv.emailAddress)}
                          disabled={isPending || revoking === inv.id}
                          className="h-auto px-2 py-1 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        >
                          {revoking === inv.id ? "Revoking…" : "Revoke"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-muted-foreground border-t">
            These users have been invited but have not yet completed sign-up. The invite email may take a few minutes to arrive.
          </p>
        </div>
      )}

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Send an invitation email. The user will create their account via the link provided.
            </DialogDescription>
          </DialogHeader>
          <InviteUserForm
            onSuccess={() => setShowAddModal(false)}
            projects={projects}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

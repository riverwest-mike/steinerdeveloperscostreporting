"use client";

import { useState, useTransition } from "react";
import { RoleSelect } from "./role-select";
import { ActiveToggle } from "./active-toggle";
import { InviteUserForm } from "./invite-user-form";
import { revokeInvite } from "./actions";

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

interface UsersSectionProps {
  users: User[];
  currentUserId: string;
  pendingInvites?: PendingInvite[];
  projects?: Project[];
}

export function UsersSection({ users, currentUserId, pendingInvites = [], projects = [] }: UsersSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filteredUsers = users.filter((u) => {
    if (statusFilter === "active") return u.is_active;
    if (statusFilter === "inactive") return !u.is_active;
    return true;
  });

  function handleRevoke(inviteId: string, email: string) {
    if (!confirm(`Revoke invitation for ${email}? They will no longer be able to use this invite link.`)) return;
    setRevokeError(null);
    setRevoking(inviteId);
    startTransition(async () => {
      const result = await revokeInvite(inviteId, email);
      if (result.error) setRevokeError(result.error);
      setRevoking(null);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Users</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {showForm ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-5 mb-4 bg-muted/20">
          <InviteUserForm onSuccess={() => setShowForm(false)} projects={projects} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <label htmlFor="status-filter" className="text-sm font-medium text-muted-foreground">
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                    {u.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ActiveToggle
                    userId={u.id}
                    isActive={u.is_active}
                    isSelf={u.id === currentUserId}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <RoleSelect
                    userId={u.id}
                    currentRole={u.role as "admin" | "project_manager" | "read_only" | "accounting"}
                    isSelf={u.id === currentUserId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Pending Invitations ({pendingInvites.length})
          </h4>
          {revokeError && (
            <p className="text-xs text-destructive mb-2">{revokeError}</p>
          )}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Projects</th>
                  <th className="px-4 py-3 text-left font-medium">Invited</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => {
                  const assignedProjects = projects.filter((p) => inv.projectIds.includes(p.id));
                  return (
                    <tr key={inv.id} className="border-b last:border-0 bg-amber-50/30">
                      <td className="px-4 py-3 text-muted-foreground">{inv.emailAddress}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {inv.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {assignedProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedProjects.map((p) => (
                              <span key={p.id} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="font-mono mr-1 opacity-60">{p.code}</span>{p.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRevoke(inv.id, inv.emailAddress)}
                          disabled={isPending || revoking === inv.id}
                          className="text-xs text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          {revoking === inv.id ? "Revoking…" : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These users have been invited but have not yet completed sign-up. The invite email may take a few minutes to arrive. If the email went to junk mail, ask the user to check their spam folder or resend the invite.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2">
        Users appear here after accepting an invitation and completing sign-up. Use the Actions column to change a user&apos;s role — you cannot change your own. Click the Status badge to activate or deactivate a user.
      </p>
    </div>
  );
}

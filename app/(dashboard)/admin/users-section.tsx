"use client";

import { useState, useTransition } from "react";
import { RoleSelect } from "./role-select";
import { ActiveToggle } from "./active-toggle";
import { InviteUserForm } from "./invite-user-form";
import { revokeInvite } from "./actions";
import { Button } from "@/components/ui/button";

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

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

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
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Users</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage accounts, roles, and access. Use the Actions column to change a user&apos;s role.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : "+ Add User"}
        </Button>
      </div>

      {showForm && (
        <div className="px-5 py-4 border-b bg-muted/20">
          <InviteUserForm onSuccess={() => setShowForm(false)} projects={projects} />
        </div>
      )}

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

      <div className="overflow-x-auto">
        <table className="w-full text-sm rw-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary capitalize">
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
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No users match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 text-xs text-muted-foreground border-t">
        Users appear here after accepting an invitation and completing sign-up. Click the Status badge to activate or deactivate a user — you cannot change your own.
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
            <table className="w-full text-sm rw-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Projects</th>
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
                      <td className="px-4 py-3 text-muted-foreground">{inv.emailAddress}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground capitalize">
                          {inv.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {assignedProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedProjects.map((p) => (
                              <span key={p.id} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary border border-primary/20">
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
            These users have been invited but have not yet completed sign-up. The invite email may take a few minutes to arrive. Ask users to check their spam folder if needed.
          </p>
        </div>
      )}
    </div>
  );
}

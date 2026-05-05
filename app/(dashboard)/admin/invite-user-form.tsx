"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "./actions";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  name: string;
  code: string;
}

export function InviteUserForm({
  onSuccess,
  projects = [],
}: {
  onSuccess?: () => void;
  projects?: Project[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"read_only" | "project_manager" | "accounting" | "admin" | "development_lead">("read_only");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const projectIds = role === "admin" || role === "accounting" || role === "development_lead" ? [] : selectedProjectIds;
    startTransition(async () => {
      const res = await inviteUser(email.trim(), role, projectIds);
      if (res.error) {
        setResult({ error: res.error });
      } else {
        setResult({ success: true });
        setEmail("");
        setRole("read_only");
        setSelectedProjectIds([]);
        setTimeout(() => onSuccess?.(), 1500);
      }
    });
  }

  const showProjectPicker = role !== "admin" && role !== "accounting" && role !== "development_lead" && projects.length > 0;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Invite New User</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-52">
            <label className="text-xs font-medium text-foreground" htmlFor="invite-email">
              Email address <span className="text-destructive">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
          <div className="space-y-1.5 w-44">
            <label className="text-xs font-medium text-foreground" htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as typeof role);
                setSelectedProjectIds([]);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="read_only">Read Only</option>
              <option value="project_manager">Project Manager</option>
              <option value="accounting">Accounting</option>
              <option value="development_lead">Development Lead</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button type="submit" disabled={isPending} size="sm" className="h-9">
            {isPending ? "Sending…" : "Send Invitation"}
          </Button>
        </div>

        {showProjectPicker && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Assign to projects{" "}
              <span className="text-muted-foreground font-normal">(optional — can be changed later)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => {
                const checked = selectedProjectIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProject(p.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:border-primary/60 hover:bg-muted/40"
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-70">{p.code}</span>
                    {p.name}
                  </button>
                );
              })}
            </div>
            {selectedProjectIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        )}
      </form>

      {result?.success && (
        <p className="mt-3 text-xs text-green-700 font-medium">
          Invitation sent! The user will receive an email with a sign-up link.
        </p>
      )}
      {result?.error && (
        <p className="mt-3 text-xs text-destructive">{result.error}</p>
      )}
      <p className="text-xs text-muted-foreground mt-3 border-t pt-3">
        The invited user will receive an email with a link to create their account.
      </p>
    </div>
  );
}

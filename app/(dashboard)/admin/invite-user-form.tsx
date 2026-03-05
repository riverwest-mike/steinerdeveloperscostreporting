"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "./actions";

export function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"read_only" | "project_manager" | "admin">("read_only");
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await inviteUser(email.trim(), role);
      if (res.error) {
        setResult({ error: res.error });
      } else {
        setResult({ success: true });
        setEmail("");
        setRole("read_only");
      }
    });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Invite New User</h3>
      <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1 flex-1 min-w-52">
          <label className="text-xs font-medium" htmlFor="invite-email">
            Email address <span className="text-destructive">*</span>
          </label>
          <input
            id="invite-email"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1 w-44">
          <label className="text-xs font-medium" htmlFor="invite-role">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="read_only">Read Only</option>
            <option value="project_manager">Project Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send Invitation"}
        </button>
      </form>
      {result?.success && (
        <p className="mt-2 text-xs text-green-700">Invitation sent! The user will receive an email with a sign-up link.</p>
      )}
      {result?.error && (
        <p className="mt-2 text-xs text-destructive">{result.error}</p>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        The invited user will receive an email with a link to create their account. New users can only sign up via invitation — enable this in the Clerk dashboard under User &amp; Authentication → Restrictions → &quot;Require invitation&quot;.
      </p>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { updateUserRole } from "./actions";

type Role = "admin" | "project_manager" | "read_only";

interface RoleSelectProps {
  userId: string;
  currentRole: Role;
  isSelf: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  read_only: "Read Only",
};

export function RoleSelect({ userId, currentRole, isSelf }: RoleSelectProps) {
  const [isPending, startTransition] = useTransition();

  if (isSelf) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
        {ROLE_LABELS[currentRole]}
      </span>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as Role;
    startTransition(() => {
      updateUserRole(userId, newRole).catch((err) => alert(err.message));
    });
  }

  return (
    <select
      defaultValue={currentRole}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-input bg-background px-2 py-1 text-xs font-medium disabled:opacity-50"
    >
      {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

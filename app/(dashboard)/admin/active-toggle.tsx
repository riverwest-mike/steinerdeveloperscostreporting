"use client";

import { useState, useTransition } from "react";
import { toggleUserActive } from "./actions";

interface ActiveToggleProps {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}

export function ActiveToggle({ userId, isActive, isSelf }: ActiveToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await toggleUserActive(userId);
            if (result?.error) setError(result.error);
          });
        }}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          isActive
            ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800"
            : "bg-red-100 text-red-800 hover:bg-green-100 hover:text-green-800"
        }`}
      >
        {isPending ? "…" : isActive ? "Active" : "Inactive"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

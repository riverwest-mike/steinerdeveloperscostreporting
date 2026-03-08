"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";

export function AssignGatesButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleAssign() {
    setStatus("running");
    setMessage("");
    try {
      const res = await fetch("/api/admin/assign-gates", { method: "POST" });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Assignment failed.");
      } else {
        setStatus("done");
        setMessage(data.message ?? "Done.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <button
        onClick={handleAssign}
        disabled={status === "running"}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <GitBranch className="h-4 w-4" />
        {status === "running" ? "Assigning…" : "Assign Gates to Transactions"}
      </button>
      {message && (
        <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

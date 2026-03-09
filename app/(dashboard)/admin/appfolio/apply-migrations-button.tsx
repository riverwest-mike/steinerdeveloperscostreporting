"use client";

import { useState } from "react";
import { Database } from "lucide-react";

export function ApplyMigrationsButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [sql, setSql] = useState("");

  async function handleApply() {
    setStatus("running");
    setMessage("");
    setSql("");
    try {
      const res = await fetch("/api/admin/apply-migrations", { method: "POST" });
      const data = await res.json() as {
        success?: boolean;
        message?: string;
        error?: string;
        instructions?: string;
        sql?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setMessage((data.instructions ?? data.error) ?? "Migration failed.");
        if (data.sql) setSql(data.sql);
      } else {
        setStatus("done");
        setMessage(data.message ?? "Migration applied successfully.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={handleApply}
          disabled={status === "running" || status === "done"}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Database className="h-4 w-4" />
          {status === "running" ? "Applying…" : status === "done" ? "Applied" : "Apply Pending Migrations"}
        </button>
        {message && (
          <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message}
          </p>
        )}
      </div>
      {sql && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">
            Run this SQL manually in the Supabase SQL editor:
          </p>
          <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all border">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}

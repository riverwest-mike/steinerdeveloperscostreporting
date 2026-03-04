"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

export function ProjectPicker({
  projects,
  currentId,
}: {
  projects: Project[];
  currentId: string;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentId);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  function handleRun() {
    if (!projectId) return;

    const propertyId = selectedProject?.appfolio_property_id ?? null;

    if (!propertyId) {
      router.push(`/reports/${projectId}`);
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch("/api/appfolio/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            fromDate: "2000-01-01",
            toDate: today,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sync failed");
        setSyncStatus("done");
        setSyncMsg(`Synced ${json.records_upserted ?? 0} records`);
      } catch (err) {
        setSyncStatus("error");
        setSyncMsg(err instanceof Error ? err.message : "Sync failed");
      }

      router.push(`/reports/${projectId}`);
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="project-picker" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="project-picker"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide invisible">&nbsp;</span>
          <button
            onClick={handleRun}
            disabled={!projectId || isPending || syncStatus === "syncing"}
            className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {syncStatus === "syncing" ? "Syncing…" : "Run Report"}
          </button>
        </div>
      </div>

      {syncStatus === "error" && (
        <p className="mt-2 text-xs text-destructive">{syncMsg}</p>
      )}
      {syncStatus === "done" && syncMsg && (
        <p className="mt-2 text-xs text-muted-foreground">{syncMsg}</p>
      )}
    </div>
  );
}

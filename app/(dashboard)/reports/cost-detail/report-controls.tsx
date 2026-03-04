"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

interface Category {
  id: string;
  name: string;
  code: string;
}

interface ReportControlsProps {
  projects: Project[];
  categories: Category[];
  currentProjectId: string | null;
  currentAsOf: string;
  currentCategoryCode: string | null;
}

export function ReportControls({
  projects,
  categories,
  currentProjectId,
  currentAsOf,
  currentCategoryCode,
}: ReportControlsProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  function buildUrl(pid: string, date: string, code: string) {
    const params = new URLSearchParams();
    if (pid) params.set("projectId", pid);
    if (date) params.set("asOf", date);
    if (code) params.set("categoryCode", code);
    return `/reports/cost-detail?${params.toString()}`;
  }

  function handleRun() {
    if (!projectId) return;

    const propertyId = selectedProject?.appfolio_property_id ?? null;

    if (!propertyId) {
      router.push(buildUrl(projectId, asOf, categoryCode));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/appfolio/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            fromDate: "2000-01-01",
            toDate: asOf,
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

      router.push(buildUrl(projectId, asOf, categoryCode));
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="cd-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="cd-project"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[240px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Select a Project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cd-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost Category
          </label>
          <select
            id="cd-category"
            value={categoryCode}
            onChange={(e) => { setCategoryCode(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[240px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— All Categories —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cd-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            As of Date
          </label>
          <input
            id="cd-date"
            type="date"
            value={asOf}
            onChange={(e) => { setAsOf(e.target.value); setSyncStatus("idle"); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

interface ReportControlsProps {
  projects: Project[];
  currentProjectId: string | null;
  currentAsOf: string;
}

export function ReportControls({
  projects,
  currentProjectId,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  function buildUrl(pid: string, date: string) {
    const params = new URLSearchParams();
    if (pid) params.set("projectId", pid);
    if (date) params.set("asOf", date);
    return `/reports/cost-management?${params.toString()}`;
  }

  function handleRun() {
    if (!projectId) return;

    try {
      localStorage.setItem("pcmr_last_filter", JSON.stringify({ projectId, asOf }));
    } catch { /* ignore */ }

    const propertyId = selectedProject?.appfolio_property_id ?? null;

    if (!propertyId) {
      router.push(buildUrl(projectId, asOf));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        // Helper: YYYY-MM-DD from a Date using LOCAL calendar date (not UTC).
        // toISOString() is UTC-based — in US timezones (UTC-4 to UTC-8) any
        // time after ~4–8pm local causes UTC to roll to the next calendar day,
        // so "yesterday local" computed via toISOString() can equal "today local."
        function localDateStr(d: Date): string {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        // fromDate: 1 year ago (local).
        const syncFrom = new Date();
        syncFrom.setFullYear(syncFrom.getFullYear() - 1);
        const fromDate = localDateStr(syncFrom);

        // toDate: cap at yesterday (local) when asOf is today or a future date.
        // AppFolio returns intraday/pending transactions when occurred_on_to = today,
        // and those records lack project_cost_category. Past and future asOf dates
        // work fine — AppFolio only returns fully-posted records for those.
        // For past asOf dates we use asOf directly so we don't under-fetch.
        const todayLocal = localDateStr(new Date());
        let syncToDate = asOf;
        if (asOf >= todayLocal) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          syncToDate = localDateStr(yesterday);
        }

        const res = await fetch("/api/appfolio/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            fromDate,
            toDate: syncToDate,
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

      router.push(buildUrl(projectId, asOf));
      // Bust the Next.js client-side router cache so the server component
      // always re-fetches fresh data after the AppFolio sync completes.
      // Without this, navigating to the same URL can serve the pre-sync
      // cached payload, making gate budget amounts appear to disappear.
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="rpt-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="rpt-project"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
          <label htmlFor="rpt-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Report Date
          </label>
          <input
            id="rpt-date"
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

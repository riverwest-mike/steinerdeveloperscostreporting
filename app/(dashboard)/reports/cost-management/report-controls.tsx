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
  currentProjectIds: string[];
  currentAsOf: string;
}

export function ReportControls({
  projects,
  currentProjectIds,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentProjectIds));
  const [asOf, setAsOf] = useState(currentAsOf);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function buildUrl(ids: Set<string>, date: string) {
    const params = new URLSearchParams();
    const sorted = [...ids].sort();
    if (sorted.length > 0) params.set("projectIds", sorted.join(","));
    if (date) params.set("asOf", date);
    return `/reports/cost-management?${params.toString()}`;
  }

  function toggleProject(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSyncStatus("idle");
  }

  function toggleAll() {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
    setSyncStatus("idle");
  }

  function handleRun() {
    if (selectedIds.size === 0) return;

    try {
      localStorage.setItem("pcmr_last_filter", JSON.stringify({ projectIds: [...selectedIds], asOf }));
    } catch { /* ignore */ }

    const toSync = projects.filter((p) => selectedIds.has(p.id) && p.appfolio_property_id);

    if (toSync.length === 0) {
      router.push(buildUrl(selectedIds, asOf));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        function localDateStr(d: Date): string {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        const syncFrom = new Date();
        syncFrom.setFullYear(syncFrom.getFullYear() - 1);
        const fromDate = localDateStr(syncFrom);

        const todayLocal = localDateStr(new Date());
        let syncToDate = asOf;
        if (asOf >= todayLocal) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          syncToDate = localDateStr(yesterday);
        }

        const results = await Promise.all(
          toSync.map((p) =>
            fetch("/api/appfolio/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ propertyId: p.appfolio_property_id, fromDate, toDate: syncToDate }),
            }).then((r) => r.json())
          )
        );

        const totalUpserted = (results as { records_upserted?: number }[]).reduce(
          (s, r) => s + (r.records_upserted ?? 0), 0
        );
        setSyncStatus("done");
        setSyncMsg(`Synced ${totalUpserted} records across ${toSync.length} project${toSync.length !== 1 ? "s" : ""}`);
      } catch (err) {
        setSyncStatus("error");
        setSyncMsg(err instanceof Error ? err.message : "Sync failed");
      }

      router.push(buildUrl(selectedIds, asOf));
      router.refresh();
    });
  }

  const allSelected = selectedIds.size === projects.length && projects.length > 0;

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-start gap-6">

        {/* Project multi-select */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between" style={{ minWidth: "280px" }}>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projects</span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div
            className="rounded-md border border-input bg-background overflow-y-auto"
            style={{ maxHeight: "180px", minWidth: "280px" }}
          >
            {projects.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/50 select-none"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  className="h-3.5 w-3.5 rounded border-input"
                />
                <span className="font-mono text-[11px] text-muted-foreground w-10 shrink-0">{p.code}</span>
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedIds.size === 0
              ? "No projects selected"
              : selectedIds.size === projects.length
              ? `All ${projects.length} projects selected`
              : `${selectedIds.size} of ${projects.length} selected`}
          </p>
        </div>

        {/* Date + Run button */}
        <div className="flex flex-col gap-4 pt-5">
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
          <button
            onClick={handleRun}
            disabled={selectedIds.size === 0 || isPending || syncStatus === "syncing"}
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

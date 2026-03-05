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
    <div className="rounded-lg border bg-card mb-6">
      <div className="px-5 py-3 border-b bg-muted/40 flex items-center justify-between">
        <span className="text-sm font-semibold">Report Filters</span>
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedIds.size === projects.length
              ? `All ${projects.length} projects`
              : `${selectedIds.size} of ${projects.length} projects selected`}
          </span>
        )}
      </div>

      <div className="px-5 py-4 flex flex-wrap items-start gap-6">
        {/* Project multi-select */}
        <div className="flex flex-col gap-1.5 min-w-72">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projects</label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="rounded-md border border-input bg-background overflow-y-auto max-h-48">
            {projects.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                  selectedIds.has(p.id) ? "bg-primary/5" : "hover:bg-accent/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
                <span className="font-mono text-[11px] text-muted-foreground w-12 shrink-0">{p.code}</span>
                <span className="truncate text-sm">{p.name}</span>
                {p.appfolio_property_id && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">AF</span>
                )}
              </label>
            ))}
          </div>
          {selectedIds.size === 0 && (
            <p className="text-xs text-muted-foreground">Select at least one project to run the report.</p>
          )}
        </div>

        {/* Date + Run button */}
        <div className="flex flex-col gap-3 pt-5">
          <div className="flex flex-col gap-1.5">
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
            className="h-9 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {syncStatus === "syncing" ? "Syncing…" : "Run Report"}
          </button>
        </div>
      </div>

      {(syncStatus === "error" || (syncStatus === "done" && syncMsg)) && (
        <div className="px-5 pb-3">
          <p className={`text-xs ${syncStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {syncMsg}
          </p>
        </div>
      )}
    </div>
  );
}

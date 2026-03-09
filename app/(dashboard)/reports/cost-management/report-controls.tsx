"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectMultiSelect } from "@/components/project-multi-select";

interface Project {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
}

interface Gate {
  id: string;
  project_id: string;
  name: string;
  sequence_number: number;
}

interface ReportControlsProps {
  projects: Project[];
  gates: Gate[];
  currentProjectIds: string[];
  currentGateId: string | null;
  currentAsOf: string;
}

export function ReportControls({
  projects,
  gates,
  currentProjectIds,
  currentGateId,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentProjectIds));
  const [gateId, setGateId] = useState(currentGateId ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // Gates available for the currently selected projects
  const availableGates = gates
    .filter((g) => selectedIds.has(g.project_id))
    .sort((a, b) => {
      if (a.project_id !== b.project_id) return a.project_id.localeCompare(b.project_id);
      return a.sequence_number - b.sequence_number;
    });

  const showProjectInGate = selectedIds.size > 1;
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  function handleProjectChange(ids: Set<string>) {
    setSelectedIds(ids);
    setSyncStatus("idle");
    if (gateId) {
      const valid = gates.filter((g) => ids.has(g.project_id)).some((g) => g.id === gateId);
      if (!valid) setGateId("");
    }
  }

  function buildUrl(ids: Set<string>, gate: string, date: string) {
    const params = new URLSearchParams();
    const sorted = [...ids].sort();
    if (sorted.length > 0) params.set("projectIds", sorted.join(","));
    if (gate) params.set("gateId", gate);
    if (date) params.set("asOf", date);
    return `/reports/cost-management?${params.toString()}`;
  }

  function handleRun() {
    if (selectedIds.size === 0) return;

    try {
      localStorage.setItem("pcmr_last_filter", JSON.stringify({
        projectIds: [...selectedIds],
        gateId: gateId || null,
        asOf,
        savedDate: new Date().toISOString().slice(0, 10),
      }));
    } catch { /* ignore */ }

    const toSync = projects.filter((p) => selectedIds.has(p.id) && p.appfolio_property_id);

    if (toSync.length === 0) {
      router.push(buildUrl(selectedIds, gateId, asOf));
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

      router.push(buildUrl(selectedIds, gateId, asOf));
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card mb-6">
      <div className="px-5 py-3 border-b bg-muted/40">
        <span className="text-sm font-semibold">Report Filters</span>
      </div>
      <div className="px-5 py-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projects</label>
          <ProjectMultiSelect
            projects={projects}
            selectedIds={selectedIds}
            onChange={handleProjectChange}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="pcm-gate" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Gate
          </label>
          <select
            id="pcm-gate"
            value={gateId}
            onChange={(e) => { setGateId(e.target.value); setSyncStatus("idle"); }}
            disabled={availableGates.length === 0}
            className="h-9 min-w-[240px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="">
              {selectedIds.size === 0 ? "— Select a project first —" : "— All Gates —"}
            </option>
            {availableGates.map((g) => {
              const proj = projectMap.get(g.project_id);
              const label = showProjectInGate && proj
                ? `${proj.code} · Gate ${g.sequence_number} — ${g.name}`
                : `Gate ${g.sequence_number} — ${g.name}`;
              return (
                <option key={g.id} value={g.id}>{label}</option>
              );
            })}
          </select>
        </div>

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

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide invisible select-none">Run</span>
          <button
            onClick={handleRun}
            disabled={selectedIds.size === 0 || isPending || syncStatus === "syncing"}
            className="h-9 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {syncStatus === "syncing" ? "Syncing…" : "Run Report"}
          </button>
        </div>

        {(syncStatus === "error" || (syncStatus === "done" && syncMsg)) && (
          <p className={`text-xs self-end pb-1 ${syncStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {syncMsg}
          </p>
        )}
      </div>
      {selectedIds.size === 0 && (
        <p className="px-5 pb-3 text-xs text-muted-foreground">Select at least one project to run the report.</p>
      )}
    </div>
  );
}

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

interface ReportControlsProps {
  projects: Project[];
  currentProjectIds: string[];
  currentAsOf: string;
  currentBasis: "Cash" | "Accrual";
}

export function ReportControls({ projects, currentProjectIds, currentAsOf, currentBasis }: ReportControlsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentProjectIds));
  const [asOf, setAsOf] = useState(currentAsOf);
  const [basis, setBasis] = useState<"Cash" | "Accrual">(currentBasis);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function buildUrl(ids: Set<string>, date: string, b: "Cash" | "Accrual") {
    const params = new URLSearchParams();
    const sorted = [...ids].sort();
    if (sorted.length > 0) params.set("projectIds", sorted.join(","));
    if (date) params.set("asOf", date);
    params.set("basis", b);
    return `/reports/balance-sheet?${params.toString()}`;
  }

  function handleRun() {
    if (selectedIds.size === 0) return;

    try {
      localStorage.setItem("bsr_last_filter", JSON.stringify({ projectIds: [...selectedIds], asOf, basis, savedDate: new Date().toISOString().slice(0, 10) }));
    } catch { /* ignore */ }

    const toSync = projects.filter((p) => selectedIds.has(p.id) && p.appfolio_property_id);

    if (toSync.length === 0) {
      router.push(buildUrl(selectedIds, asOf, basis));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const results = await Promise.all(
          toSync.map((p) =>
            fetch("/api/appfolio/sync-balance-sheet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ propertyId: p.appfolio_property_id, asOfDate: asOf, accountingBasis: basis }),
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

      router.push(buildUrl(selectedIds, asOf, basis));
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
            onChange={(ids) => { setSelectedIds(ids); setSyncStatus("idle"); }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bsr-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            As of Date
          </label>
          <input
            id="bsr-date"
            type="date"
            value={asOf}
            onChange={(e) => { setAsOf(e.target.value); setSyncStatus("idle"); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bsr-basis" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Accounting Basis
          </label>
          <select
            id="bsr-basis"
            value={basis}
            onChange={(e) => { setBasis(e.target.value as "Cash" | "Accrual"); setSyncStatus("idle"); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="Accrual">Accrual</option>
            <option value="Cash">Cash</option>
          </select>
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

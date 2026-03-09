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

interface Category {
  id: string;
  name: string;
  code: string;
}

interface Gate {
  id: string;
  name: string;
  sequence_number: number;
}

interface ReportControlsProps {
  projects: Project[];
  categories: Category[];
  gates: Gate[];
  currentProjectIds: string[];
  currentAsOf: string;
  currentCategoryCode: string | null;
  currentGateId: string | null;
}

export function ReportControls({
  projects,
  categories,
  gates,
  currentProjectIds,
  currentAsOf,
  currentCategoryCode,
  currentGateId,
}: ReportControlsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentProjectIds));
  const [asOf, setAsOf] = useState(currentAsOf);
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [gateId, setGateId] = useState(currentGateId ?? "");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function buildUrl(ids: Set<string>, date: string, code: string, gate: string) {
    const params = new URLSearchParams();
    const sorted = [...ids].sort();
    if (sorted.length > 0) params.set("projectIds", sorted.join(","));
    if (date) params.set("asOf", date);
    if (code) params.set("categoryCode", code);
    if (gate) params.set("gateId", gate);
    return `/reports/cost-detail?${params.toString()}`;
  }

  function handleRun() {
    if (selectedIds.size === 0) return;

    try {
      localStorage.setItem("cost_detail_last_filter", JSON.stringify({ projectIds: [...selectedIds], categoryCode, asOf, gateId }));
    } catch { /* ignore */ }

    const toSync = projects.filter((p) => selectedIds.has(p.id) && p.appfolio_property_id);

    if (toSync.length === 0) {
      router.push(buildUrl(selectedIds, asOf, categoryCode, gateId));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const results = await Promise.all(
          toSync.map((p) =>
            fetch("/api/appfolio/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ propertyId: p.appfolio_property_id, fromDate: "2000-01-01", toDate: asOf }),
            }).then((r) => r.json())
          )
        );
        const total = (results as { records_upserted?: number }[]).reduce(
          (s, r) => s + (r.records_upserted ?? 0), 0
        );
        setSyncStatus("done");
        setSyncMsg(`Synced ${total} records across ${toSync.length} project${toSync.length !== 1 ? "s" : ""}`);
      } catch (err) {
        setSyncStatus("error");
        setSyncMsg(err instanceof Error ? err.message : "Sync failed");
      }
      router.push(buildUrl(selectedIds, asOf, categoryCode, gateId));
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
            onChange={(ids) => { setSelectedIds(ids); setGateId(""); setSyncStatus("idle"); }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cd-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost Category
          </label>
          <select
            id="cd-category"
            value={categoryCode}
            onChange={(e) => { setCategoryCode(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— All Categories —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        {gates.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="cd-gate" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Gate
            </label>
            <select
              id="cd-gate"
              value={gateId}
              onChange={(e) => { setGateId(e.target.value); setSyncStatus("idle"); }}
              className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— All Gates —</option>
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  G{g.sequence_number} — {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

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

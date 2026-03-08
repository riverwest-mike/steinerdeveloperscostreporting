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
  project_id: string;
  name: string;
  sequence_number: number;
}

interface ReportControlsProps {
  projects: Project[];
  categories: Category[];
  gatesByProjectId: Record<string, Gate[]>;
  currentProjectIds: string[];
  currentGateId: string | null;
  currentCategoryCode: string | null;
  currentAsOf: string;
  currentPaymentFilter: string | null;
}

export function ReportControls({
  projects,
  categories,
  gatesByProjectId,
  currentProjectIds,
  currentGateId,
  currentCategoryCode,
  currentAsOf,
  currentPaymentFilter,
}: ReportControlsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentProjectIds));
  const [gateId, setGateId] = useState(currentGateId ?? "");
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [paymentFilter, setPaymentFilter] = useState(currentPaymentFilter ?? "");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // When project selection changes, clear gate selection if the selected gate
  // no longer belongs to any of the newly selected projects.
  function handleProjectChange(ids: Set<string>) {
    setSelectedIds(ids);
    setSyncStatus("idle");
    // Check if current gate still valid
    if (gateId) {
      const validGates = [...ids].flatMap((id) => gatesByProjectId[id] ?? []);
      if (!validGates.some((g) => g.id === gateId)) {
        setGateId("");
      }
    }
  }

  // Compute available gates from selected projects
  const availableGates: Gate[] = [...selectedIds].flatMap(
    (id) => gatesByProjectId[id] ?? []
  ).sort((a, b) => {
    // Sort by project then sequence
    if (a.project_id !== b.project_id) return a.project_id.localeCompare(b.project_id);
    return a.sequence_number - b.sequence_number;
  });

  // If multiple projects selected, prefix gate name with project code
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const showProjectInGate = selectedIds.size > 1;

  function buildUrl(ids: Set<string>, gate: string, code: string, date: string, payment: string) {
    const params = new URLSearchParams();
    const sorted = [...ids].sort();
    if (sorted.length > 0) params.set("projectIds", sorted.join(","));
    if (gate) params.set("gateId", gate);
    if (code) params.set("categoryCode", code);
    if (date) params.set("asOf", date);
    if (payment) params.set("paymentFilter", payment);
    return `/reports/gate-detail?${params.toString()}`;
  }

  function handleRun() {
    if (selectedIds.size === 0) return;

    try {
      localStorage.setItem("gate_detail_last_filter", JSON.stringify({
        projectIds: [...selectedIds],
        gateId,
        categoryCode,
        asOf,
        paymentFilter,
      }));
    } catch { /* ignore */ }

    const toSync = projects.filter((p) => selectedIds.has(p.id) && p.appfolio_property_id);

    if (toSync.length === 0) {
      router.push(buildUrl(selectedIds, gateId, categoryCode, asOf, paymentFilter));
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
      router.push(buildUrl(selectedIds, gateId, categoryCode, asOf, paymentFilter));
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
          <label htmlFor="gd-gate" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Gate
          </label>
          <select
            id="gd-gate"
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
          {selectedIds.size === 0 && (
            <span className="text-[10px] text-muted-foreground">Select a project to enable gate filter</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gd-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost Category
          </label>
          <select
            id="gd-category"
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

        <div className="flex flex-col gap-1">
          <label htmlFor="gd-payment" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Payment
          </label>
          <select
            id="gd-payment"
            value={paymentFilter}
            onChange={(e) => { setPaymentFilter(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[140px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— All —</option>
            <option value="paid">Paid Only</option>
            <option value="unpaid">Unpaid Only</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gd-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            As of Date
          </label>
          <input
            id="gd-date"
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

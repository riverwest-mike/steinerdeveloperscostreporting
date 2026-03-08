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
  currentProjectId: string | null;
  currentGateId: string | null;
  currentCategoryCode: string | null;
  currentAsOf: string;
  currentPaymentFilter: string | null;
}

export function ReportControls({
  projects,
  categories,
  gatesByProjectId,
  currentProjectId,
  currentGateId,
  currentCategoryCode,
  currentAsOf,
  currentPaymentFilter,
}: ReportControlsProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [gateId, setGateId] = useState(currentGateId ?? "");
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [paymentFilter, setPaymentFilter] = useState(currentPaymentFilter ?? "");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  // When project selection changes, clear gate selection
  function handleProjectChange(id: string) {
    setProjectId(id);
    setSyncStatus("idle");
    // Clear gate if it doesn't belong to newly selected project
    if (gateId && id) {
      const validGates = gatesByProjectId[id] ?? [];
      if (!validGates.some((g) => g.id === gateId)) {
        setGateId("");
      }
    } else {
      setGateId("");
    }
  }

  const availableGates: Gate[] = projectId
    ? (gatesByProjectId[projectId] ?? []).sort((a, b) => a.sequence_number - b.sequence_number)
    : [];

  function buildUrl(pid: string, gate: string, code: string, date: string, payment: string) {
    const params = new URLSearchParams();
    if (pid) params.set("projectId", pid);
    if (gate) params.set("gateId", gate);
    if (code) params.set("categoryCode", code);
    if (date) params.set("asOf", date);
    if (payment) params.set("paymentFilter", payment);
    return `/reports/gate-detail?${params.toString()}`;
  }

  function handleRun() {
    if (!projectId) return;

    try {
      localStorage.setItem("gate_detail_last_filter", JSON.stringify({
        projectId,
        gateId,
        categoryCode,
        asOf,
        paymentFilter,
      }));
    } catch { /* ignore */ }

    const project = projects.find((p) => p.id === projectId);
    if (!project?.appfolio_property_id) {
      router.push(buildUrl(projectId, gateId, categoryCode, asOf, paymentFilter));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const result = await fetch("/api/appfolio/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: project.appfolio_property_id,
            fromDate: "2000-01-01",
            toDate: asOf,
          }),
        }).then((r) => r.json()) as { records_upserted?: number };
        setSyncStatus("done");
        setSyncMsg(`Synced ${result.records_upserted ?? 0} records`);
      } catch (err) {
        setSyncStatus("error");
        setSyncMsg(err instanceof Error ? err.message : "Sync failed");
      }
      router.push(buildUrl(projectId, gateId, categoryCode, asOf, paymentFilter));
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card mb-6">
      <div className="px-5 py-3 border-b bg-muted/40">
        <span className="text-sm font-semibold">Report Filters</span>
      </div>
      <div className="px-5 py-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="gd-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="gd-project"
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="h-9 min-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
              {!projectId ? "— Select a project first —" : "— All Gates —"}
            </option>
            {availableGates.map((g) => (
              <option key={g.id} value={g.id}>
                Gate {g.sequence_number} — {g.name}
              </option>
            ))}
          </select>
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
            disabled={!projectId || isPending || syncStatus === "syncing"}
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
      {!projectId && (
        <p className="px-5 pb-3 text-xs text-muted-foreground">Select a project to run the report.</p>
      )}
    </div>
  );
}

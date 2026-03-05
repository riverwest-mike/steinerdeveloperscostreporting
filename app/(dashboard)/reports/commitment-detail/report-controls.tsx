"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Category {
  id: string;
  name: string;
  code: string;
}

interface ReportControlsProps {
  projects: Project[];
  categories: Category[];
  currentProjectIds: string[];
  currentCategoryCode: string | null;
  currentContractStatus: string;
  currentAsOf: string;
}

const STATUS_OPTIONS = [
  { value: "active_complete", label: "Active & Complete" },
  { value: "active", label: "Active Only" },
  { value: "complete", label: "Complete Only" },
  { value: "all", label: "All (incl. Terminated)" },
];

export function ReportControls({
  projects,
  categories,
  currentProjectIds,
  currentCategoryCode,
  currentContractStatus,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();
  // Multi-select: stored as Set of project IDs
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set(currentProjectIds)
  );
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [contractStatus, setContractStatus] = useState(currentContractStatus);
  const [asOf, setAsOf] = useState(currentAsOf);
  const [isPending, startTransition] = useTransition();

  function buildUrl() {
    const params = new URLSearchParams();
    const ids = Array.from(selectedProjectIds);
    if (ids.length > 0) params.set("projectIds", ids.join(","));
    if (categoryCode) params.set("categoryCode", categoryCode);
    params.set("contractStatus", contractStatus);
    params.set("asOf", asOf);
    return `/reports/commitment-detail?${params.toString()}`;
  }

  function handleRun() {
    try {
      localStorage.setItem(
        "commitment_detail_last_filter",
        JSON.stringify({
          projectIds: Array.from(selectedProjectIds),
          categoryCode,
          contractStatus,
          asOf,
        })
      );
    } catch { /* ignore */ }

    startTransition(() => {
      router.push(buildUrl());
    });
  }

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-end gap-6">

        {/* Project multi-select */}
        <div className="flex flex-col gap-1">
          <label htmlFor="cd-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="cd-project"
            multiple
            size={Math.min(projects.length + 1, 5)}
            value={Array.from(selectedProjectIds)}
            onChange={(e) => {
              const selected = new Set(
                Array.from(e.target.selectedOptions).map((o) => o.value).filter(Boolean)
              );
              setSelectedProjectIds(selected);
            }}
            className="min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">Hold Ctrl/Cmd to select multiple. None = all projects.</span>
        </div>

        {/* Cost Category */}
        <div className="flex flex-col gap-1">
          <label htmlFor="cd-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost Category
          </label>
          <select
            id="cd-category"
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
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

        {/* Contract Status */}
        <div className="flex flex-col gap-1">
          <label htmlFor="cd-status" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Contract Status
          </label>
          <select
            id="cd-status"
            value={contractStatus}
            onChange={(e) => setContractStatus(e.target.value)}
            className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* As of Date */}
        <div className="flex flex-col gap-1">
          <label htmlFor="cd-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            As of Date
          </label>
          <input
            id="cd-date"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide invisible">&nbsp;</span>
          <button
            onClick={handleRun}
            disabled={isPending}
            className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "Loading…" : "Run Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

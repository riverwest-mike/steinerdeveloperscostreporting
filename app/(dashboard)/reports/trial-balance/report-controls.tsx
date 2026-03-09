"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Props {
  projects: Project[];
  currentProjectId: string | null;
  currentDateFrom: string | null;
  currentDateTo: string | null;
}

export function ReportControls({
  projects,
  currentProjectId,
  currentDateFrom,
  currentDateTo,
}: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");

  function run() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (!projectId && !dateFrom && !dateTo) params.set("run", "1");
    router.push(`/reports/trial-balance?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card mb-6">
      <div className="px-5 py-3 border-b bg-muted/40">
        <span className="text-sm font-semibold">Report Filters</span>
      </div>
      <div className="px-5 py-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tb-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</label>
          <select
            id="tb-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 min-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— All Projects —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide invisible select-none">Run</span>
          <button
            onClick={run}
            className="h-9 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Run Report
          </button>
        </div>
      </div>
    </div>
  );
}

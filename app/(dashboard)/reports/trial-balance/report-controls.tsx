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
    // Always set a sentinel so we know the user ran the report
    if (!projectId && !dateFrom && !dateTo) params.set("run", "1");
    router.push(`/reports/trial-balance?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 rounded-lg border bg-muted/30 p-4">
      {/* Project */}
      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-xs font-medium text-muted-foreground">Project</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Date From */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Date To */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <button
        onClick={run}
        className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Run Report
      </button>
    </div>
  );
}

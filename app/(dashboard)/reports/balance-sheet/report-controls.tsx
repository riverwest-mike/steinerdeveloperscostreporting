"use client";

import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
}

interface ReportControlsProps {
  projects: Project[];
  currentProjectId: string | null;
  currentAsOf: string;
  currentBasis: "Cash" | "Accrual";
}

export function ReportControls({
  projects,
  currentProjectId,
  currentAsOf,
  currentBasis,
}: ReportControlsProps) {
  const router = useRouter();

  function navigate(projectId: string, asOf: string, basis: "Cash" | "Accrual") {
    if (projectId) {
      try {
        localStorage.setItem(
          "bsr_last_filter",
          JSON.stringify({ projectId, asOf, basis })
        );
      } catch {
        // storage unavailable — ignore
      }
    }
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (asOf) params.set("asOf", asOf);
    params.set("basis", basis);
    router.push(`/reports/balance-sheet?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="bsr-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Project
        </label>
        <select
          id="bsr-project"
          value={currentProjectId ?? ""}
          onChange={(e) => navigate(e.target.value, currentAsOf, currentBasis)}
          className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
        <label htmlFor="bsr-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          As of Date
        </label>
        <input
          id="bsr-date"
          type="date"
          value={currentAsOf}
          onChange={(e) => navigate(currentProjectId ?? "", e.target.value, currentBasis)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bsr-basis" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Accounting Basis
        </label>
        <select
          id="bsr-basis"
          value={currentBasis}
          onChange={(e) => navigate(currentProjectId ?? "", currentAsOf, e.target.value as "Cash" | "Accrual")}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="Accrual">Accrual</option>
          <option value="Cash">Cash</option>
        </select>
      </div>

      {currentProjectId && (
        <p className="text-xs text-muted-foreground self-end pb-1.5">
          As of{" "}
          {new Date(currentAsOf + "T00:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {" · "}
          {currentBasis} Basis
        </p>
      )}
    </div>
  );
}

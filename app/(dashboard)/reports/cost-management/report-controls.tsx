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
}

export function ReportControls({
  projects,
  currentProjectId,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();

  function navigate(projectId: string, asOf: string) {
    // Persist so the user lands back on the same filter after navigating away
    if (projectId) {
      try {
        localStorage.setItem(
          "pcmr_last_filter",
          JSON.stringify({ projectId, asOf })
        );
      } catch {
        // storage unavailable — ignore
      }
    }
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (asOf) params.set("asOf", asOf);
    router.push(`/reports/cost-management?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="rpt-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Project
        </label>
        <select
          id="rpt-project"
          value={currentProjectId ?? ""}
          onChange={(e) => navigate(e.target.value, currentAsOf)}
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
        <label htmlFor="rpt-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Report Date
        </label>
        <input
          id="rpt-date"
          type="date"
          value={currentAsOf}
          onChange={(e) => navigate(currentProjectId ?? "", e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {currentProjectId && (
        <p className="text-xs text-muted-foreground self-end pb-1.5">
          Data as of{" "}
          {new Date(currentAsOf + "T00:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}

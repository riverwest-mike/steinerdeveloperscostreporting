"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";

interface Project {
  id: string;
  name: string;
  code: string;
}

interface Props {
  projects: Project[];
}

export function ReportingPackageButton({ projects }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = projects.find((p) => p.id === selectedId);

  function openBothReports() {
    if (!selectedId) return;
    window.open(`/reports/cost-management?projectId=${selectedId}`, "_blank");
    window.open(`/reports/balance-sheet?projectId=${selectedId}`, "_blank");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Open Reporting Package
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 rounded-lg border bg-popover shadow-md p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Select Project
          </p>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Choose a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>

          {selected && (
            <p className="text-xs text-muted-foreground mb-3">
              Opens the PCM Report and Balance Sheet for{" "}
              <span className="font-medium text-foreground">{selected.code}</span> in two new tabs.
            </p>
          )}

          <button
            onClick={openBothReports}
            disabled={!selectedId}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-input bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Both Reports
          </button>
        </div>
      )}
    </div>
  );
}

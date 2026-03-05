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

interface ReportControlsProps {
  projects: Project[];
  categories: Category[];
  currentProjectId: string | null;
  currentVendorName: string | null;
  currentCategoryCode: string | null;
  currentAsOf: string;
}

export function ReportControls({
  projects,
  categories,
  currentProjectId,
  currentVendorName,
  currentCategoryCode,
  currentAsOf,
}: ReportControlsProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [vendorName, setVendorName] = useState(currentVendorName ?? "");
  const [categoryCode, setCategoryCode] = useState(currentCategoryCode ?? "");
  const [asOf, setAsOf] = useState(currentAsOf);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const canRun = true; // "All Projects" with no other filter is valid

  function buildUrl(pid: string, vendor: string, code: string, date: string) {
    const params = new URLSearchParams();
    if (pid) params.set("projectId", pid);
    if (vendor.trim()) params.set("vendorName", vendor.trim());
    if (code) params.set("categoryCode", code);
    if (date) params.set("asOf", date);
    return `/reports/vendor-detail?${params.toString()}`;
  }

  function handleRun() {
    if (!canRun) return;

    try {
      localStorage.setItem("vendor_detail_last_filter", JSON.stringify({ projectId, vendorName, categoryCode, asOf }));
    } catch { /* ignore */ }

    const propertyId = selectedProject?.appfolio_property_id ?? null;

    if (!propertyId) {
      router.push(buildUrl(projectId, vendorName, categoryCode, asOf));
      return;
    }

    setSyncStatus("syncing");
    setSyncMsg("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/appfolio/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            fromDate: "2000-01-01",
            toDate: asOf,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sync failed");
        setSyncStatus("done");
        setSyncMsg(`Synced ${json.records_upserted ?? 0} records`);
      } catch (err) {
        setSyncStatus("error");
        setSyncMsg(err instanceof Error ? err.message : "Sync failed");
      }

      router.push(buildUrl(projectId, vendorName, categoryCode, asOf));
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4 mb-6">
      <div className="flex flex-wrap items-end gap-6">

        <div className="flex flex-col gap-1">
          <label htmlFor="vd-project" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Project
          </label>
          <select
            id="vd-project"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setSyncStatus("idle"); }}
            className="h-9 min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— All Projects —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vd-vendor" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Vendor Name
          </label>
          <input
            id="vd-vendor"
            type="text"
            value={vendorName}
            onChange={(e) => { setVendorName(e.target.value); setSyncStatus("idle"); }}
            placeholder="Search vendor…"
            className="h-9 min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vd-category" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost Category
          </label>
          <select
            id="vd-category"
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
          <label htmlFor="vd-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            As of Date
          </label>
          <input
            id="vd-date"
            type="date"
            value={asOf}
            onChange={(e) => { setAsOf(e.target.value); setSyncStatus("idle"); }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide invisible">&nbsp;</span>
          <button
            onClick={handleRun}
            disabled={!canRun || isPending || syncStatus === "syncing"}
            className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {syncStatus === "syncing" ? "Syncing…" : "Run Report"}
          </button>
        </div>
      </div>

      {syncStatus === "error" && (
        <p className="mt-2 text-xs text-destructive">{syncMsg}</p>
      )}
      {syncStatus === "done" && syncMsg && (
        <p className="mt-2 text-xs text-muted-foreground">{syncMsg}</p>
      )}
    </div>
  );
}

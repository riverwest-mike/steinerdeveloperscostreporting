"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Project { id: string; name: string; code: string }
interface Category { id: string; name: string; code: string }

interface Props {
  projects: Project[];
  categories: Category[];
  currentProjectId: string | null;
  currentStatus: string;
  currentCategoryId: string | null;
  currentDateFrom: string | null;
  currentDateTo: string | null;
  currentType: string;
}

export function COLogControls({
  projects,
  categories,
  currentProjectId,
  currentStatus,
  currentCategoryId,
  currentDateFrom,
  currentDateTo,
  currentType,
}: Props) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(currentProjectId ?? "");
  const [status, setStatus] = useState(currentStatus);
  const [categoryId, setCategoryId] = useState(currentCategoryId ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");
  const [type, setType] = useState(currentType);

  function handleRun() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (status && status !== "all") params.set("status", status);
    else params.set("status", "all");
    if (categoryId) params.set("categoryId", categoryId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (type && type !== "all") params.set("type", type);
    else params.set("type", "all");
    router.push(`/reports/change-orders?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Single project select */}
        <div className="space-y-1 sm:col-span-2 lg:col-span-2">
          <label className="text-xs font-medium">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">— All Projects —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="proposed">Proposed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="voided">Voided</option>
            </select>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">All Types</option>
              <option value="contract">Contract COs</option>
              <option value="budget">Budget COs (no contract)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {/* Cost Category */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Cost Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Proposed Date Range</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1.5 text-xs"
              />
              <span className="text-xs text-muted-foreground shrink-0">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Run Report
        </button>
        <button
          onClick={() => {
            setProjectId("");
            setStatus("all");
            setCategoryId("");
            setDateFrom("");
            setDateTo("");
            setType("all");
          }}
          className="rounded border px-4 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

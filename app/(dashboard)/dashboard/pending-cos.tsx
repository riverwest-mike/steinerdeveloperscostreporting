"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { ExpandButton, ExpandedModal } from "@/components/expandable-card";

export interface PendingCO {
  id: string;
  project_id: string;
  project_name: string;
  co_number: string;
  description: string;
  amount: number;
  proposed_date: string; // YYYY-MM-DD
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function daysAgo(dateStr: string): number {
  const proposed = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - proposed.getTime()) / 86_400_000);
}

const AGE_FILTERS = ["All", "7+ days", "14+ days"] as const;
const SORT_OPTIONS = ["Oldest first", "Newest first", "Amount ↓", "Amount ↑"] as const;

interface PendingCOsFilterState {
  projectFilter: string;
  setProjectFilter: (s: string) => void;
  ageFilter: (typeof AGE_FILTERS)[number];
  setAgeFilter: (s: (typeof AGE_FILTERS)[number]) => void;
  sortBy: (typeof SORT_OPTIONS)[number];
  setSortBy: (s: (typeof SORT_OPTIONS)[number]) => void;
}

function COList({
  cos,
  filters,
  expanded = false,
}: {
  cos: PendingCO[];
  filters: PendingCOsFilterState;
  expanded?: boolean;
}) {
  const { projectFilter, setProjectFilter, ageFilter, setAgeFilter, sortBy, setSortBy } = filters;

  const projects = useMemo(
    () => ["All", ...Array.from(new Set(cos.map((c) => c.project_name))).sort()],
    [cos]
  );

  const visible = useMemo(() => {
    let result = cos.filter((co) => {
      const age = daysAgo(co.proposed_date);
      if (projectFilter !== "All" && co.project_name !== projectFilter)
        return false;
      if (ageFilter === "7+ days" && age < 7) return false;
      if (ageFilter === "14+ days" && age < 14) return false;
      return true;
    });

    if (sortBy === "Oldest first")
      result = [...result].sort((a, b) =>
        a.proposed_date.localeCompare(b.proposed_date)
      );
    else if (sortBy === "Newest first")
      result = [...result].sort((a, b) =>
        b.proposed_date.localeCompare(a.proposed_date)
      );
    else if (sortBy === "Amount ↓")
      result = [...result].sort((a, b) => b.amount - a.amount);
    else if (sortBy === "Amount ↑")
      result = [...result].sort((a, b) => a.amount - b.amount);

    return result;
  }, [cos, projectFilter, ageFilter, sortBy]);

  const totalAmount = cos.reduce((sum, co) => sum + co.amount, 0);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Pending Change Orders</h3>
          {cos.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {cos.length} awaiting approval &nbsp;·&nbsp; {usd(totalAmount)}{" "}
              total
            </p>
          )}
        </div>
        {expanded && cos.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {projects.length > 2 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1">
              {AGE_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setAgeFilter(f)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    ageFilter === f
                      ? "bg-amber-100 text-amber-700"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {cos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No change orders pending approval.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No change orders match this filter.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {visible.map((co) => {
            const age = daysAgo(co.proposed_date);
            const ageColor =
              age >= 14
                ? "text-red-600"
                : age >= 7
                ? "text-amber-600"
                : "text-muted-foreground";

            return (
              <Link
                key={co.id}
                href={`/projects/${co.project_id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                    age >= 14
                      ? "bg-red-400"
                      : age >= 7
                      ? "bg-amber-400"
                      : "bg-muted-foreground/40"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">
                    {co.project_name}
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    {co.co_number}
                    <span className="ml-2 font-normal text-foreground/70">
                      {usd(co.amount)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {co.description}
                  </p>
                </div>

                <span className={`text-xs flex-shrink-0 ${ageColor}`}>
                  {age === 0 ? "Today" : `${age}d ago`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PendingCOs({ cos }: { cos: PendingCO[] }) {
  const [open, setOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("All");
  const [ageFilter, setAgeFilter] = useState<(typeof AGE_FILTERS)[number]>("All");
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]>("Oldest first");
  const filters: PendingCOsFilterState = {
    projectFilter, setProjectFilter, ageFilter, setAgeFilter, sortBy, setSortBy,
  };

  return (
    <>
      <div className="relative">
        <div className="absolute top-0 right-0 z-10">
          <ExpandButton onClick={() => setOpen(true)} />
        </div>
        <COList cos={cos} filters={filters} />
      </div>
      <ExpandedModal open={open} onClose={() => setOpen(false)}>
        <COList cos={cos} filters={filters} expanded />
      </ExpandedModal>
    </>
  );
}

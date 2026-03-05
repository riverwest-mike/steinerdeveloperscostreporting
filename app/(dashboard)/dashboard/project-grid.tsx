"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export interface ProjectCard {
  id: string;
  name: string;
  code: string;
  status: string;
  image_url: string | null;
  gateName: string | null;
  budgetTotal: number;
  spent: number;
}

type FilterTab = "all" | "active" | "on_hold" | "completed";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
];

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-600",
};

// Derive a consistent background+text color from the project code
const MONOGRAM_PALETTES = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
];

function monogramStyle(code: string): string {
  const sum = code.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return MONOGRAM_PALETTES[sum % MONOGRAM_PALETTES.length];
}

function usd(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)
    return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  if (budget <= 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No budget entered</p>
    );
  }
  const pct = Math.min(spent / budget, 1);
  const pctDisplay = Math.round(pct * 100);
  const barColor =
    pct >= 0.95
      ? "bg-red-500"
      : pct >= 0.8
      ? "bg-amber-400"
      : "bg-emerald-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {usd(spent)} <span className="text-muted-foreground/60">of</span> {usd(budget)}
        </span>
        <span
          className={`font-semibold tabular-nums ${
            pct >= 0.95
              ? "text-red-600"
              : pct >= 0.8
              ? "text-amber-600"
              : "text-emerald-700"
          }`}
        >
          {pctDisplay}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pctDisplay}%` }}
        />
      </div>
    </div>
  );
}

export function ProjectGrid({ projects }: { projects: ProjectCard[] }) {
  const [tab, setTab] = useState<FilterTab>("all");

  const visible =
    tab === "all" ? projects : projects.filter((p) => p.status === tab);

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {FILTER_TABS.map((t) => {
          const count =
            t.key === "all"
              ? projects.length
              : projects.filter((p) => p.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-xs ${
                    tab === t.key ? "opacity-75" : "opacity-50"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No {tab === "all" ? "" : tab.replace("_", " ") + " "}projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group rounded-lg border bg-card hover:border-primary/50 hover:shadow-sm transition-all flex flex-col"
            >
              {/* Card header */}
              <div className="flex items-start gap-3 p-4 pb-3">
                {/* Image or monogram */}
                {project.image_url ? (
                  <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded">
                    <Image
                      src={project.image_url}
                      alt={project.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                ) : (
                  <div
                    className={`h-12 w-16 flex-shrink-0 rounded flex items-center justify-center font-bold text-sm tracking-wide ${monogramStyle(
                      project.code
                    )}`}
                  >
                    {project.code.slice(0, 4)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors">
                    {project.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {project.code}
                    {project.gateName && (
                      <> &middot; {project.gateName}</>
                    )}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ${
                    STATUS_BADGE[project.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {project.status.replace("_", " ")}
                </span>
              </div>

              {/* Budget bar */}
              <div className="px-4 pb-4">
                <BudgetBar spent={project.spent} budget={project.budgetTotal} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

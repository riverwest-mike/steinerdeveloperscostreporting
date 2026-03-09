"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown, AlertCircle } from "lucide-react";
import { PIPELINE_STAGES } from "./pipeline-board";
import { updatePipelineStage, type PipelineStage } from "./actions";
import type { PipelineProject } from "./pipeline-client";

type SortKey = "name" | "stage" | "budget" | "spent" | "equity" | "days" | "completion";
type SortDir = "asc" | "desc";

function usd(n: number | null): string {
  if (n === null || n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function StageBadge({ stageId }: { stageId: string }) {
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId);
  if (!stage) return <span className="text-xs text-muted-foreground">{stageId}</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${stage.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${stage.dot}`} />
      {stage.label}
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />;
}

interface StageSelectProps {
  project: PipelineProject;
}

function StageSelect({ project }: StageSelectProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(newStage: string) {
    setError(null);
    startTransition(async () => {
      const result = await updatePipelineStage(project.id, newStage as PipelineStage);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="relative">
        <select
          value={project.pipeline_stage}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className="appearance-none rounded border border-input bg-muted/40 px-2 py-1 pr-5 text-[11px] font-medium disabled:opacity-50 cursor-pointer"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      </div>
      {error && (
        <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
          <AlertCircle className="h-2.5 w-2.5" /> {error}
        </p>
      )}
    </div>
  );
}

interface PipelineListProps {
  projects: PipelineProject[];
  canEdit: boolean;
}

export function PipelineList({ projects, canEdit }: PipelineListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("stage");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterStage, setFilterStage] = useState<string>("all");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const stageOrder = new Map<string, number>(PIPELINE_STAGES.map((s, i) => [s.id, i]));

  const filtered = filterStage === "all"
    ? projects
    : projects.filter((p) => p.pipeline_stage === filterStage);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":       cmp = a.name.localeCompare(b.name); break;
      case "stage":      cmp = (stageOrder.get(a.pipeline_stage) ?? 99) - (stageOrder.get(b.pipeline_stage) ?? 99); break;
      case "budget":     cmp = a.budget_total - b.budget_total; break;
      case "spent":      cmp = a.actual_spend - b.actual_spend; break;
      case "equity":     cmp = (a.equity_invested ?? 0) - (b.equity_invested ?? 0); break;
      case "days":       cmp = daysAgo(b.pipeline_stage_entered_at) - daysAgo(a.pipeline_stage_entered_at); break;
      case "completion": cmp = (a.expected_completion ?? "9999").localeCompare(b.expected_completion ?? "9999"); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Summary row
  const totalBudget = sorted.reduce((s, p) => s + p.budget_total, 0);
  const totalSpent = sorted.reduce((s, p) => s + p.actual_spend, 0);
  const totalEquity = sorted.reduce((s, p) => s + (p.equity_invested ?? 0), 0);
  const totalProjected = sorted.reduce((s, p) => s + (p.projected_total_cost ?? 0), 0);

  function Th({ children, col }: { children: React.ReactNode; col: SortKey }) {
    return (
      <th
        className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:bg-muted/70 transition-colors whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        <div className="flex items-center gap-1">
          {children}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        </div>
      </th>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Stage filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Filter:</span>
        <button
          onClick={() => setFilterStage("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filterStage === "all" ? "bg-foreground text-background border-foreground" : "hover:bg-muted"
          }`}
        >
          All ({projects.length})
        </button>
        {PIPELINE_STAGES.map((stage) => {
          const count = projects.filter((p) => p.pipeline_stage === stage.id).length;
          if (count === 0) return null;
          return (
            <button
              key={stage.id}
              onClick={() => setFilterStage(stage.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterStage === stage.id
                  ? `${stage.color} border-current`
                  : "hover:bg-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
              {stage.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs">
              <Th col="name">Project</Th>
              <Th col="stage">Stage</Th>
              <Th col="days">Days in Stage</Th>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Type</th>
              <Th col="budget">Budget</Th>
              <Th col="spent">Actual Spend</Th>
              <Th col="equity">Equity</Th>
              <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Proj. Cost</th>
              <Th col="completion">Exp. Completion</Th>
              {canEdit && <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Move Stage</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const days = daysAgo(p.pipeline_stage_entered_at);
              const budgetPct = p.budget_total > 0 ? (p.actual_spend / p.budget_total) * 100 : null;
              const isOver = p.budget_total > 0 && p.actual_spend > p.budget_total;
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div>
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium hover:underline text-foreground"
                      >
                        {p.name}
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                        {(p.city || p.state) && (
                          <span className="text-[10px] text-muted-foreground">
                            · {[p.city, p.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StageBadge stageId={p.pipeline_stage} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-sm text-muted-foreground">
                    {days === 0 ? "Today" : `${days}d`}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {p.property_type ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs">
                    {p.budget_total > 0 ? (
                      <div>
                        <span className="font-medium">{usd(p.budget_total)}</span>
                        {budgetPct !== null && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isOver ? "bg-red-500" : "bg-primary"}`}
                                style={{ width: `${Math.min(budgetPct, 100)}%` }}
                              />
                            </div>
                            <span className={`text-[10px] ${isOver ? "text-red-600" : "text-muted-foreground"}`}>
                              {Math.round(budgetPct)}%
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs">
                    {p.actual_spend > 0 ? usd(p.actual_spend) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs">
                    {p.equity_invested !== null ? usd(p.equity_invested) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs text-right">
                    {p.projected_total_cost !== null ? usd(p.projected_total_cost) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {p.expected_completion
                      ? new Date(p.expected_completion + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <StageSelect project={p} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {sorted.length > 1 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/50 font-semibold text-xs">
                <td className="px-4 py-2.5 text-sm" colSpan={4}>
                  Totals ({sorted.length} projects)
                </td>
                <td className="px-4 py-2.5 tabular-nums">{totalBudget > 0 ? usd(totalBudget) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{totalSpent > 0 ? usd(totalSpent) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{totalEquity > 0 ? usd(totalEquity) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-right">{totalProjected > 0 ? usd(totalProjected) : "—"}</td>
                <td className="px-4 py-2.5" colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>

        {sorted.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No projects match the selected filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Pencil, X, Check, AlertCircle } from "lucide-react";
import { updatePipelineStage, updatePipelineFinancials, type PipelineStage } from "./actions";
import type { PipelineProject } from "./pipeline-client";

export const PIPELINE_STAGES: { id: PipelineStage; label: string; color: string; dot: string }[] = [
  { id: "prospect",        label: "Prospect",        color: "bg-slate-100 text-slate-700 border-slate-200",   dot: "bg-slate-400" },
  { id: "under_contract",  label: "Under Contract",  color: "bg-blue-100 text-blue-800 border-blue-200",      dot: "bg-blue-500" },
  { id: "pre_development", label: "Pre-Development", color: "bg-violet-100 text-violet-800 border-violet-200", dot: "bg-violet-500" },
  { id: "construction",    label: "Construction",    color: "bg-amber-100 text-amber-800 border-amber-200",    dot: "bg-amber-500" },
  { id: "lease_up",        label: "Lease-Up",        color: "bg-green-100 text-green-800 border-green-200",    dot: "bg-green-500" },
  { id: "stabilized",      label: "Stabilized",      color: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-600" },
  { id: "disposed",        label: "Disposed",        color: "bg-gray-100 text-gray-500 border-gray-200",       dot: "bg-gray-400" },
];

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function daysAgo(dateStr: string): number {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

function StageBadge({ stageId }: { stageId: string }) {
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId);
  if (!stage) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${stage.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
      {stage.label}
    </span>
  );
}

interface ProjectCardProps {
  project: PipelineProject;
  canEdit: boolean;
}

function ProjectCard({ project, canEdit }: ProjectCardProps) {
  const [isPending, startTransition] = useTransition();
  const [stageError, setStageError] = useState<string | null>(null);
  const [editingFinancials, setEditingFinancials] = useState(false);
  const [finError, setFinError] = useState<string | null>(null);
  const [finPending, startFinTransition] = useTransition();

  // Local financials state for inline editing
  const [acqPrice, setAcqPrice] = useState(project.acquisition_price?.toString() ?? "");
  const [equity, setEquity] = useState(project.equity_invested?.toString() ?? "");
  const [projCost, setProjCost] = useState(project.projected_total_cost?.toString() ?? "");

  const days = daysAgo(project.pipeline_stage_entered_at);
  const budgetPct = project.budget_total > 0
    ? Math.min((project.actual_spend / project.budget_total) * 100, 100)
    : null;
  const isOverBudget = project.budget_total > 0 && project.actual_spend > project.budget_total;

  function handleStageChange(newStage: string) {
    setStageError(null);
    startTransition(async () => {
      const result = await updatePipelineStage(project.id, newStage as PipelineStage);
      if (result.error) setStageError(result.error);
    });
  }

  function handleSaveFinancials() {
    setFinError(null);
    startFinTransition(async () => {
      const result = await updatePipelineFinancials(project.id, {
        acquisition_price: acqPrice ? Number(acqPrice.replace(/[^0-9.]/g, "")) : null,
        equity_invested: equity ? Number(equity.replace(/[^0-9.]/g, "")) : null,
        projected_total_cost: projCost ? Number(projCost.replace(/[^0-9.]/g, "")) : null,
      });
      if (result.error) {
        setFinError(result.error);
      } else {
        setEditingFinancials(false);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Card header with project code + status dot */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {project.code}
            </span>
            {project.status === "on_hold" && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                On Hold
              </span>
            )}
          </div>
          <Link
            href={`/projects/${project.id}`}
            className="text-sm font-semibold hover:underline leading-snug text-foreground line-clamp-2"
          >
            {project.name}
          </Link>
          {(project.city || project.state) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[project.city, project.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        {project.property_type && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
            {project.property_type}
          </span>
        )}
      </div>

      {/* Budget bar */}
      {project.budget_total > 0 ? (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Budget consumption</span>
            <span className={isOverBudget ? "text-red-600 font-medium" : ""}>
              {usd(project.actual_spend)} / {usd(project.budget_total)}
              {budgetPct !== null && ` (${Math.round((project.actual_spend / project.budget_total) * 100)}%)`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${budgetPct ?? 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Financial summary */}
      <div className="px-3 pb-2">
        {!editingFinancials ? (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {project.acquisition_price !== null && (
              <span>Acq: <span className="font-medium text-foreground">{usd(project.acquisition_price)}</span></span>
            )}
            {project.equity_invested !== null && (
              <span>Equity: <span className="font-medium text-foreground">{usd(project.equity_invested)}</span></span>
            )}
            {project.projected_total_cost !== null && (
              <span>Proj: <span className="font-medium text-foreground">{usd(project.projected_total_cost)}</span></span>
            )}
            {canEdit && (
              <button
                onClick={() => setEditingFinancials(true)}
                className="ml-auto p-0.5 rounded hover:bg-muted transition-colors"
                title="Edit financials"
              >
                <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Acq. Price", value: acqPrice, setter: setAcqPrice },
                { label: "Equity", value: equity, setter: setEquity },
                { label: "Proj. Cost", value: projCost, setter: setProjCost },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="text-[9px] text-muted-foreground block mb-0.5">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder="$0"
                    className="w-full rounded border border-input bg-background px-1.5 py-1 text-[10px]"
                  />
                </div>
              ))}
            </div>
            {finError && (
              <p className="text-[10px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-2.5 w-2.5" /> {finError}
              </p>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleSaveFinancials}
                disabled={finPending}
                className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
              >
                <Check className="h-2.5 w-2.5" />
                {finPending ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingFinancials(false); setFinError(null); }}
                className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium"
              >
                <X className="h-2.5 w-2.5" />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer: days in stage + expected completion */}
      <div className="px-3 pt-1.5 pb-2 mt-auto border-t border-border/50 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {days === 0 ? "Moved today" : `${days}d in stage`}
        </span>
        {project.expected_completion && (
          <span className="text-[10px] text-muted-foreground">
            ECD: {new Date(project.expected_completion + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </span>
        )}
      </div>

      {/* Stage mover (admin/PM only) */}
      {canEdit && (
        <div className="px-3 pb-3">
          {stageError && (
            <p className="text-[10px] text-destructive mb-1 flex items-center gap-1">
              <AlertCircle className="h-2.5 w-2.5" /> {stageError}
            </p>
          )}
          <div className="relative">
            <select
              value={project.pipeline_stage}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={isPending}
              className="w-full appearance-none rounded border border-input bg-muted/40 px-2 py-1.5 pr-6 text-[11px] font-medium disabled:opacity-50 cursor-pointer"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          </div>
          {isPending && (
            <p className="text-[10px] text-muted-foreground mt-1">Moving…</p>
          )}
        </div>
      )}
    </div>
  );
}

interface PipelineBoardProps {
  projects: PipelineProject[];
  canEdit: boolean;
}

export function PipelineBoard({ projects, canEdit }: PipelineBoardProps) {
  const projectsByStage = new Map<string, PipelineProject[]>();
  for (const stage of PIPELINE_STAGES) {
    projectsByStage.set(stage.id, []);
  }
  for (const p of projects) {
    const stage = p.pipeline_stage;
    if (!projectsByStage.has(stage)) {
      projectsByStage.set(stage, []);
    }
    projectsByStage.get(stage)!.push(p);
  }

  // Compute per-stage totals for column header
  function stageMetrics(stageProjects: PipelineProject[]) {
    const totalBudget = stageProjects.reduce((s, p) => s + p.budget_total, 0);
    const totalEquity = stageProjects.reduce((s, p) => s + (p.equity_invested ?? 0), 0);
    return { totalBudget, totalEquity };
  }

  return (
    <div className="overflow-x-auto h-full">
      <div className="flex gap-3 px-4 sm:px-6 py-4 min-w-max h-full items-start">
        {PIPELINE_STAGES.map((stage) => {
          const stageProjects = projectsByStage.get(stage.id) ?? [];
          const { totalBudget, totalEquity } = stageMetrics(stageProjects);
          return (
            <div key={stage.id} className="flex flex-col w-64 shrink-0">
              {/* Column header */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                    <span className="text-xs font-semibold">{stage.label}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {stageProjects.length}
                    </span>
                  </div>
                </div>
                {(totalBudget > 0 || totalEquity > 0) && (
                  <div className="text-[10px] text-muted-foreground space-x-2 pl-4">
                    {totalBudget > 0 && <span>Budget: {usd(totalBudget)}</span>}
                    {totalEquity > 0 && <span>Equity: {usd(totalEquity)}</span>}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div className="space-y-2 flex-1">
                {stageProjects.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-6 text-center">
                    <p className="text-[10px] text-muted-foreground">No projects</p>
                  </div>
                ) : (
                  stageProjects.map((p) => (
                    <ProjectCard key={p.id} project={p} canEdit={canEdit} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

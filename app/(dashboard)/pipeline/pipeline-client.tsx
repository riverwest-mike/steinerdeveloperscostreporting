"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { PipelineBoard } from "./pipeline-board";
import { PipelineList } from "./pipeline-list";

export interface PipelineProject {
  id: string;
  name: string;
  code: string;
  status: string;
  property_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  image_url: string | null;
  expected_completion: string | null;
  pipeline_stage: string;
  pipeline_stage_entered_at: string;
  acquisition_price: number | null;
  equity_invested: number | null;
  projected_total_cost: number | null;
  budget_total: number;
  actual_spend: number;
}

interface PipelineClientProps {
  projects: PipelineProject[];
  canEdit: boolean;
}

export function PipelineClient({ projects, canEdit }: PipelineClientProps) {
  const [view, setView] = useState<"board" | "list">("board");
  const [showArchived, setShowArchived] = useState(false);

  const visibleProjects = showArchived
    ? projects
    : projects.filter((p) => p.status !== "archived");

  const archivedCount = projects.filter((p) => p.status === "archived").length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-card gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {visibleProjects.length} project{visibleProjects.length !== 1 ? "s" : ""} across all stages
            {!showArchived && archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(true)}
                className="ml-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
              >
                + {archivedCount} archived
              </button>
            )}
            {showArchived && archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(false)}
                className="ml-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
              >
                hide archived
              </button>
            )}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-md border bg-muted/40 p-0.5 gap-0.5">
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "board"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "list"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === "board" ? (
          <PipelineBoard projects={visibleProjects} canEdit={canEdit} />
        ) : (
          <PipelineList projects={visibleProjects} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}

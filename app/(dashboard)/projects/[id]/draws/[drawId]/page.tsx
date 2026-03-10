export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { DrawDetail } from "./draw-detail";
import { getMyRole } from "../actions";
import { HELP } from "@/lib/help";

interface Props {
  params: Promise<{ id: string; drawId: string }>;
}

export default async function DrawRequestPage({ params }: Props) {
  const { id: projectId, drawId } = await params;
  const supabase = createAdminClient();

  const [
    { data: draw },
    { data: project },
    { data: categories },
    { data: lines },
    { data: previousDraws },
    userRole,
  ] = await Promise.all([
    supabase
      .from("draw_requests")
      .select("id, draw_number, title, submission_date, status, lender, notes")
      .eq("id", drawId)
      .single(),
    supabase
      .from("projects")
      .select("id, name, code, lender")
      .eq("id", projectId)
      .single(),
    supabase
      .from("cost_categories")
      .select("id, name, code, display_order")
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("draw_request_lines")
      .select("cost_category_id, this_draw_amount, notes")
      .eq("draw_request_id", drawId),
    supabase
      .from("draw_requests")
      .select("id, draw_number, status, draw_request_lines(cost_category_id, this_draw_amount)")
      .eq("project_id", projectId)
      .order("draw_number"),
    getMyRole(),
  ]);

  if (!draw || !project) notFound();

  // Build budget map: sum revised_budget per cost category across all gates for this project
  const { data: gateBudgets } = await supabase
    .from("gate_budgets")
    .select("cost_category_id, revised_budget, gates!inner(project_id)")
    .eq("gates.project_id", projectId);

  interface GateBudgetRaw {
    cost_category_id: string;
    revised_budget: number;
    gates: { project_id: string } | null;
  }

  const budgetByCategory = new Map<string, number>();
  for (const row of (gateBudgets ?? []) as GateBudgetRaw[]) {
    const cur = budgetByCategory.get(row.cost_category_id) ?? 0;
    budgetByCategory.set(row.cost_category_id, cur + (row.revised_budget ?? 0));
  }

  const budgets = Array.from(budgetByCategory.entries()).map(([cost_category_id, revised_budget]) => ({
    cost_category_id,
    revised_budget,
  }));

  interface PrevDrawRaw {
    id: string;
    draw_number: number;
    status: string;
    draw_request_lines: { cost_category_id: string; this_draw_amount: number }[];
  }

  const prevDraws = (previousDraws ?? []).map((d: PrevDrawRaw) => ({
    id: d.id,
    draw_number: d.draw_number,
    status: d.status,
    lines: (d.draw_request_lines ?? []).map((l) => ({
      cost_category_id: l.cost_category_id,
      this_draw_amount: l.this_draw_amount,
    })),
  }));

  const canEdit = ["admin", "accounting", "project_manager"].includes(userRole ?? "");

  return (
    <div>
      <Header title={`Draw #${draw.draw_number}`} helpContent={HELP.drawDetail} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-4 flex items-center flex-wrap gap-1">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span className="mx-1">/</span>
          <Link href={`/projects/${projectId}?tab=draws`} className="hover:text-foreground transition-colors">
            {project.name}
          </Link>
          <span className="mx-1">/</span>
          <span className="text-foreground font-medium">Draw #{draw.draw_number}</span>
        </nav>

        <DrawDetail
          draw={draw}
          projectId={projectId}
          projectName={project.name}
          categories={categories ?? []}
          lines={lines ?? []}
          budgets={budgets}
          previousDraws={prevDraws}
          canEdit={canEdit}
        />

        {/* Excel export */}
        <div className="mt-4 flex items-center gap-3">
          <a
            href={`/api/draws/${drawId}/export`}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Export to Excel
          </a>
          <span className="text-xs text-muted-foreground">
            Downloads a .xlsx file with the draw schedule.
          </span>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleProjectIds } from "@/lib/access";
import { Header } from "@/components/layout/header";
import { HELP } from "@/lib/help";
import { PipelineClient } from "./pipeline-client";
import type { PipelineProject } from "./pipeline-client";

export default async function PipelinePage() {
  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");

  const { data: userRow } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (userRow as { role?: string } | null)?.role ?? "read_only";
  const canEdit = role === "admin" || role === "project_manager";

  const allowedProjectIds = await getAccessibleProjectIds(supabase, userId);

  // Fetch all accessible projects with pipeline fields
  let projectsQuery = supabase
    .from("projects")
    .select(
      "id, name, code, status, property_type, address, city, state, image_url, " +
      "expected_completion, appfolio_property_id, " +
      "pipeline_stage, pipeline_stage_entered_at, " +
      "acquisition_price, equity_invested, projected_total_cost"
    )
    .order("name");

  if (allowedProjectIds !== null) {
    projectsQuery = projectsQuery.in(
      "id",
      allowedProjectIds.length > 0 ? allowedProjectIds : [""]
    );
  }

  const { data: rawProjects } = await projectsQuery;
  const projects = (rawProjects ?? []) as Array<{
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
    appfolio_property_id: string | null;
    pipeline_stage: string;
    pipeline_stage_entered_at: string;
    acquisition_price: number | null;
    equity_invested: number | null;
    projected_total_cost: number | null;
  }>;

  if (projects.length === 0) {
    return (
      <div>
        <Header title="Pipeline" helpContent={HELP.pipeline} />
        <div className="p-4 sm:p-6">
          <h2 className="text-2xl font-bold tracking-tight mb-1">Pipeline</h2>
          <p className="text-muted-foreground mb-8">Track projects from prospect through disposition.</p>
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              {role === "read_only" || role === "project_manager"
                ? "You haven't been assigned to any projects yet."
                : "No projects found. Create a project to get started."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const projectIds = projects.map((p) => p.id);

  // Budget totals per project: sum revised_budget across all gates
  const { data: gates } = await supabase
    .from("gates")
    .select("id, project_id")
    .in("project_id", projectIds);

  const gateIds = (gates ?? []).map((g: { id: string }) => g.id);
  const gateToProject = new Map<string, string>();
  for (const g of gates ?? []) {
    gateToProject.set((g as { id: string; project_id: string }).id, (g as { id: string; project_id: string }).project_id);
  }

  const budgetByProject = new Map<string, number>();
  if (gateIds.length > 0) {
    const { data: gateBudgets } = await supabase
      .from("gate_budgets")
      .select("gate_id, revised_budget")
      .in("gate_id", gateIds);

    for (const gb of (gateBudgets ?? []) as { gate_id: string; revised_budget: number }[]) {
      const projectId = gateToProject.get(gb.gate_id);
      if (projectId) {
        budgetByProject.set(projectId, (budgetByProject.get(projectId) ?? 0) + Number(gb.revised_budget));
      }
    }
  }

  // Actual spend per project from AppFolio
  const propertyIds = projects
    .filter((p) => p.appfolio_property_id)
    .map((p) => p.appfolio_property_id as string);

  const spentByProperty = new Map<string, number>();
  if (propertyIds.length > 0) {
    const { data: transactions } = await supabase
      .from("appfolio_transactions")
      .select("appfolio_property_id, invoice_amount")
      .in("appfolio_property_id", propertyIds);

    for (const tx of (transactions ?? []) as { appfolio_property_id: string; invoice_amount: number }[]) {
      spentByProperty.set(
        tx.appfolio_property_id,
        (spentByProperty.get(tx.appfolio_property_id) ?? 0) + Number(tx.invoice_amount)
      );
    }
  }

  const propertyToProjectId = new Map<string, string>();
  for (const p of projects) {
    if (p.appfolio_property_id) propertyToProjectId.set(p.appfolio_property_id, p.id);
  }

  const spentByProject = new Map<string, number>();
  for (const [propId, amount] of spentByProperty) {
    const projId = propertyToProjectId.get(propId);
    if (projId) spentByProject.set(projId, amount);
  }

  // Assemble final project objects for the client
  const pipelineProjects: PipelineProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
    property_type: p.property_type,
    address: p.address,
    city: p.city,
    state: p.state,
    image_url: p.image_url,
    expected_completion: p.expected_completion,
    pipeline_stage: p.pipeline_stage,
    pipeline_stage_entered_at: p.pipeline_stage_entered_at,
    acquisition_price: p.acquisition_price ? Number(p.acquisition_price) : null,
    equity_invested: p.equity_invested ? Number(p.equity_invested) : null,
    projected_total_cost: p.projected_total_cost ? Number(p.projected_total_cost) : null,
    budget_total: budgetByProject.get(p.id) ?? 0,
    actual_spend: spentByProject.get(p.id) ?? 0,
  }));

  return (
    <div>
      <Header title="Pipeline" helpContent={HELP.pipeline} />
      <PipelineClient projects={pipelineProjects} canEdit={canEdit} />
    </div>
  );
}

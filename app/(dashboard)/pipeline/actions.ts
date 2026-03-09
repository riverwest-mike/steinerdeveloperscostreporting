"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/lib/audit";

export type PipelineStage =
  | "prospect"
  | "under_contract"
  | "pre_development"
  | "construction"
  | "lease_up"
  | "stabilized"
  | "disposed";

async function requirePM() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!data || !["admin", "project_manager"].includes(data.role)) {
    throw new Error(`Insufficient permissions (role: ${data?.role ?? "none"})`);
  }
  return { userId, supabase, role: data.role as string };
}

async function assertProjectAccess(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string,
  role: string
) {
  if (role === "project_manager") {
    const { data: access } = await supabase
      .from("project_users")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single();
    if (!access) throw new Error("You do not have permission to update this project");
  }
}

export async function updatePipelineStage(
  projectId: string,
  toStage: PipelineStage,
  notes?: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase, role } = await requirePM();
    await assertProjectAccess(supabase, projectId, userId, role);

    const { data: project } = await supabase
      .from("projects")
      .select("pipeline_stage, name")
      .eq("id", projectId)
      .single();
    if (!project) throw new Error("Project not found");

    const fromStage = project.pipeline_stage as string;

    const { error } = await supabase
      .from("projects")
      .update({
        pipeline_stage: toStage,
        pipeline_stage_entered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (error) throw new Error(error.message);

    await supabase.from("project_stage_history").insert({
      project_id: projectId,
      from_stage: fromStage,
      to_stage: toStage,
      changed_by: userId,
      notes: notes?.trim() || null,
    });

    await insertAuditLog({
      user_id: userId,
      action: "pipeline.stage_change",
      entity_type: "project",
      entity_id: projectId,
      label: project.name,
      payload: { from: fromStage, to: toStage, notes: notes?.trim() || null },
    });

    revalidatePath("/pipeline");
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[updatePipelineStage]", err);
    return { error: err instanceof Error ? err.message : "Failed to update stage" };
  }
}

export async function updatePipelineFinancials(
  projectId: string,
  financials: {
    acquisition_price: number | null;
    equity_invested: number | null;
    projected_total_cost: number | null;
  }
): Promise<{ error?: string }> {
  try {
    const { userId, supabase, role } = await requirePM();
    await assertProjectAccess(supabase, projectId, userId, role);

    const { error } = await supabase
      .from("projects")
      .update({
        acquisition_price: financials.acquisition_price,
        equity_invested: financials.equity_invested,
        projected_total_cost: financials.projected_total_cost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "pipeline.financials_update",
      entity_type: "project",
      entity_id: projectId,
      payload: financials,
    });

    revalidatePath("/pipeline");
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[updatePipelineFinancials]", err);
    return { error: err instanceof Error ? err.message : "Failed to update financials" };
  }
}

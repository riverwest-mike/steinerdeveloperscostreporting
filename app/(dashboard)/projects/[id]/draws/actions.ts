"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/lib/audit";

async function requirePM() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (!data || !["admin", "project_manager", "accounting"].includes(data.role)) {
    throw new Error(`Insufficient permissions (role: ${data?.role ?? "none"})`);
  }
  return { userId, supabase, role: data.role as string };
}

export async function getMyRole(): Promise<string | null> {
  try {
    const userId = (await headers()).get("x-clerk-user-id");
    if (!userId) return null;
    const supabase = createAdminClient();
    const { data } = await supabase.from("users").select("role").eq("id", userId).single();
    return data?.role ?? null;
  } catch {
    return null;
  }
}

export async function createDrawRequest(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const submissionDate = (formData.get("submission_date") as string)?.trim();
    if (!submissionDate) return { error: "Submission date is required" };

    // Auto-assign draw number: max existing + 1
    const { data: existing } = await supabase
      .from("draw_requests")
      .select("draw_number")
      .eq("project_id", projectId)
      .order("draw_number", { ascending: false })
      .limit(1);

    const drawNumber = existing && existing.length > 0 ? existing[0].draw_number + 1 : 1;

    const { data: project } = await supabase
      .from("projects")
      .select("lender")
      .eq("id", projectId)
      .single();

    const { data: draw, error } = await supabase
      .from("draw_requests")
      .insert({
        project_id: projectId,
        draw_number: drawNumber,
        title: (formData.get("title") as string)?.trim() || null,
        submission_date: submissionDate,
        status: "draft",
        lender: (formData.get("lender") as string)?.trim() || project?.lender || null,
        notes: (formData.get("notes") as string)?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "draw_request.create",
      entity_type: "draw_request",
      entity_id: draw!.id,
      project_id: projectId,
      label: `Draw #${drawNumber}`,
      payload: { draw_number: drawNumber },
    });

    revalidatePath(`/projects/${projectId}`);
    return { id: draw!.id };
  } catch (err) {
    console.error("[createDrawRequest]", err);
    return { error: err instanceof Error ? err.message : "Failed to create draw request" };
  }
}

export async function updateDrawRequest(
  drawId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const submissionDate = (formData.get("submission_date") as string)?.trim();
    if (!submissionDate) return { error: "Submission date is required" };

    const { error } = await supabase
      .from("draw_requests")
      .update({
        title: (formData.get("title") as string)?.trim() || null,
        submission_date: submissionDate,
        lender: (formData.get("lender") as string)?.trim() || null,
        notes: (formData.get("notes") as string)?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", drawId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "draw_request.update",
      entity_type: "draw_request",
      entity_id: drawId,
      project_id: projectId,
      label: "Updated draw request header",
      payload: {},
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/draws/${drawId}`);
    return {};
  } catch (err) {
    console.error("[updateDrawRequest]", err);
    return { error: err instanceof Error ? err.message : "Failed to update draw request" };
  }
}

export async function updateDrawStatus(
  drawId: string,
  projectId: string,
  status: "draft" | "submitted" | "approved" | "rejected"
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { error } = await supabase
      .from("draw_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", drawId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "draw_request.status",
      entity_type: "draw_request",
      entity_id: drawId,
      project_id: projectId,
      label: `Status → ${status}`,
      payload: { status },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/draws/${drawId}`);
    return {};
  } catch (err) {
    console.error("[updateDrawStatus]", err);
    return { error: err instanceof Error ? err.message : "Failed to update status" };
  }
}

export async function deleteDrawRequest(
  drawId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { error } = await supabase
      .from("draw_requests")
      .delete()
      .eq("id", drawId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "draw_request.delete",
      entity_type: "draw_request",
      entity_id: drawId,
      project_id: projectId,
      label: "Deleted draw request",
      payload: {},
    });

    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[deleteDrawRequest]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete draw request" };
  }
}

export async function upsertDrawLines(
  drawId: string,
  projectId: string,
  lines: { cost_category_id: string; this_draw_amount: number; notes?: string | null }[]
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    // Upsert all lines (insert or update on conflict)
    const payload = lines.map((l) => ({
      draw_request_id: drawId,
      cost_category_id: l.cost_category_id,
      this_draw_amount: l.this_draw_amount,
      notes: l.notes ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("draw_request_lines")
      .upsert(payload, { onConflict: "draw_request_id,cost_category_id" });
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "draw_request.lines",
      entity_type: "draw_request",
      entity_id: drawId,
      project_id: projectId,
      label: `Updated ${lines.length} line item${lines.length !== 1 ? "s" : ""}`,
      payload: {},
    });

    revalidatePath(`/projects/${projectId}/draws/${drawId}`);
    return {};
  } catch (err) {
    console.error("[upsertDrawLines]", err);
    return { error: err instanceof Error ? err.message : "Failed to save line items" };
  }
}

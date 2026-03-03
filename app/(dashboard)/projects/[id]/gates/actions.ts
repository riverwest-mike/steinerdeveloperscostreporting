"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requirePM() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (!data || !["admin", "project_manager"].includes(data.role)) {
    throw new Error("Insufficient permissions");
  }
  return { userId, supabase };
}

export async function createGate(projectId: string, formData: FormData) {
  const { userId, supabase } = await requirePM();

  const payload = {
    project_id: projectId,
    name: (formData.get("name") as string).trim(),
    sequence_number: Number(formData.get("sequence_number")),
    status: "pending" as const,
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    created_by: userId,
  };

  const { error } = await supabase.from("gates").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}

export async function updateGate(gateId: string, projectId: string, formData: FormData) {
  const { supabase } = await requirePM();

  const payload = {
    name: (formData.get("name") as string).trim(),
    sequence_number: Number(formData.get("sequence_number")),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    notes: (formData.get("notes") as string)?.trim() || null,
  };

  const { error } = await supabase.from("gates").update(payload).eq("id", gateId);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gates/${gateId}`);
}

export async function activateGate(gateId: string, projectId: string) {
  const { supabase } = await requirePM();

  const { error } = await supabase
    .from("gates")
    .update({ status: "active" })
    .eq("id", gateId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gates/${gateId}`);
}

export async function closeGate(gateId: string, projectId: string) {
  const { userId, supabase } = await requirePM();

  const { error } = await supabase
    .from("gates")
    .update({
      status: "closed",
      is_locked: true,
      closed_at: new Date().toISOString(),
      closed_by: userId,
    })
    .eq("id", gateId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/gates/${gateId}`);
}

export interface BudgetRow {
  cost_category_id: string;
  original_budget: number;
}

export async function upsertGateBudgets(
  gateId: string,
  projectId: string,
  rows: BudgetRow[]
) {
  const { userId, supabase } = await requirePM();

  // Confirm gate is not locked
  const { data: gate } = await supabase
    .from("gates")
    .select("is_locked")
    .eq("id", gateId)
    .single();

  if (gate?.is_locked) throw new Error("Gate is locked and cannot be modified");

  const upsertRows = rows.map((r) => ({
    gate_id: gateId,
    cost_category_id: r.cost_category_id,
    original_budget: r.original_budget,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("gate_budgets")
    .upsert(upsertRows, { onConflict: "gate_id,cost_category_id" });

  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}/gates/${gateId}`);
  revalidatePath(`/projects/${projectId}`);
}

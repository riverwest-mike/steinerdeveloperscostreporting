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
    throw new Error(`Insufficient permissions (role: ${data?.role ?? "none"})`);
  }
  return { userId, supabase };
}

export async function createGate(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
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
    return {};
  } catch (err) {
    console.error("[createGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to create gate" };
  }
}

export async function updateGate(
  gateId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
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
    return {};
  } catch (err) {
    console.error("[updateGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to update gate" };
  }
}

export async function activateGate(
  gateId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();

    const { error } = await supabase
      .from("gates")
      .update({ status: "active" })
      .eq("id", gateId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);

    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/gates/${gateId}`);
    return {};
  } catch (err) {
    console.error("[activateGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to activate gate" };
  }
}

export async function closeGate(
  gateId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
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
    return {};
  } catch (err) {
    console.error("[closeGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to close gate" };
  }
}

export interface GateUploadRow {
  name: string;
  sequence_number: number;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  /** Record<cost_category_code, amount> */
  budgets: Record<string, number>;
}

export async function uploadGates(
  projectId: string,
  rows: GateUploadRow[]
): Promise<{ error?: string; created: number }> {
  try {
    const { userId, supabase } = await requirePM();

    if (!rows.length) return { error: "No rows provided", created: 0 };

    // Fetch active categories to map code → id
    const { data: categories, error: catErr } = await supabase
      .from("cost_categories")
      .select("id, code")
      .eq("is_active", true);
    if (catErr) throw new Error(catErr.message);

    const codeToId: Record<string, string> = {};
    for (const c of categories ?? []) codeToId[c.code] = c.id;

    let created = 0;
    for (const row of rows) {
      // Insert gate
      const { data: gate, error: gateErr } = await supabase
        .from("gates")
        .insert({
          project_id: projectId,
          name: row.name.trim(),
          sequence_number: row.sequence_number,
          status: "pending",
          start_date: row.start_date || null,
          end_date: row.end_date || null,
          notes: row.notes?.trim() || null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (gateErr) throw new Error(`Row "${row.name}": ${gateErr.message}`);

      // Insert budget rows where a valid code maps to an amount
      const budgetRows = Object.entries(row.budgets)
        .filter(([code]) => codeToId[code] !== undefined)
        .map(([code, amount]) => ({
          gate_id: gate.id,
          cost_category_id: codeToId[code],
          original_budget: amount ?? 0,
          created_by: userId,
        }));

      if (budgetRows.length) {
        const { error: budgetErr } = await supabase
          .from("gate_budgets")
          .insert(budgetRows);
        if (budgetErr) throw new Error(`Budgets for "${row.name}": ${budgetErr.message}`);
      }

      created++;
    }

    revalidatePath(`/projects/${projectId}`);
    return { created };
  } catch (err) {
    console.error("[uploadGates]", err);
    return { error: err instanceof Error ? err.message : "Upload failed", created: 0 };
  }
}

export interface BudgetRow {
  cost_category_id: string;
  original_budget: number;
}

export async function upsertGateBudgets(
  gateId: string,
  projectId: string,
  rows: BudgetRow[]
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

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
    return {};
  } catch (err) {
    console.error("[upsertGateBudgets]", err);
    return { error: err instanceof Error ? err.message : "Failed to save budgets" };
  }
}

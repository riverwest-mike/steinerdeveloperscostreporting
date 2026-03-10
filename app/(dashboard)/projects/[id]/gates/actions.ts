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
  return { userId, supabase };
}

async function requireAdmin() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (!data || data.role !== "admin") {
    throw new Error(`Admin role required (role: ${data?.role ?? "none"})`);
  }
  return { userId, supabase };
}

export async function createGate(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const sequenceNumber = Number(formData.get("sequence_number"));
    if (!sequenceNumber || sequenceNumber < 1) throw new Error("Gate # is required");

    const { data: dup } = await supabase
      .from("gates")
      .select("id")
      .eq("project_id", projectId)
      .eq("sequence_number", sequenceNumber)
      .maybeSingle();
    if (dup) throw new Error(`Gate #${sequenceNumber} already exists for this project`);

    const payload = {
      project_id: projectId,
      name: (formData.get("name") as string)?.trim() || "",
      sequence_number: sequenceNumber,
      status: "pending" as const,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      created_by: userId,
    };

    const { error } = await supabase.from("gates").insert(payload);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.create",
      entity_type: "gate",
      project_id: projectId,
      label: payload.name ?? undefined,
      payload: { name: payload.name, sequence_number: payload.sequence_number },
    });
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
    const { userId, supabase } = await requirePM();

    const sequenceNumber = Number(formData.get("sequence_number"));
    if (!sequenceNumber || sequenceNumber < 1) throw new Error("Gate # is required");

    // Block duplicate sequence numbers (excluding the gate being updated)
    const { data: dup } = await supabase
      .from("gates")
      .select("id")
      .eq("project_id", projectId)
      .eq("sequence_number", sequenceNumber)
      .neq("id", gateId)
      .maybeSingle();
    if (dup) throw new Error(`Gate #${sequenceNumber} already exists for this project`);

    const payload = {
      name: (formData.get("name") as string)?.trim() || "",
      sequence_number: sequenceNumber,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    };

    const { error } = await supabase.from("gates").update(payload).eq("id", gateId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.update",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
      label: payload.name ?? undefined,
    });
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
    const { userId, supabase } = await requirePM();

    const { error } = await supabase
      .from("gates")
      .update({ status: "active" })
      .eq("id", gateId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.activate",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
    });
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

    await insertAuditLog({
      user_id: userId,
      action: "gate.close",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
    });
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
): Promise<{ error?: string; created: number; updated: number; unknownCodes?: string[] }> {
  try {
    const { userId, supabase } = await requirePM();

    if (!rows.length) return { error: "No rows provided", created: 0, updated: 0 };

    // Fetch active categories to map code → id (case-insensitive, trimmed)
    const { data: categories, error: catErr } = await supabase
      .from("cost_categories")
      .select("id, code")
      .eq("is_active", true);
    if (catErr) throw new Error(catErr.message);

    // Normalize keys: trim + uppercase so Excel headers like "hard" match DB code "HARD"
    const codeToId: Record<string, string> = {};
    for (const c of categories ?? []) codeToId[c.code.trim().toUpperCase()] = c.id;

    // Collect unrecognized column names across all rows (report back to UI)
    const unknownCodeSet = new Set<string>();

    // Fetch existing gates for this project to detect sequence number collisions
    const { data: existingGates, error: egErr } = await supabase
      .from("gates")
      .select("id, sequence_number, is_locked")
      .eq("project_id", projectId);
    if (egErr) throw new Error(egErr.message);

    const seqToExisting: Record<number, { id: string; is_locked: boolean }> = {};
    for (const g of existingGates ?? []) seqToExisting[g.sequence_number] = g;

    let created = 0;
    let updated = 0;
    const processedGateIds: string[] = [];

    for (const row of rows) {
      const existing = seqToExisting[row.sequence_number];

      if (existing) {
        // Refuse to overwrite a locked gate
        if (existing.is_locked) {
          throw new Error(
            `Gate #${row.sequence_number} "${row.name}" is locked and cannot be replaced`
          );
        }

        // Update gate metadata (gates table has no updated_at column)
        const { error: updateErr } = await supabase
          .from("gates")
          .update({
            name: row.name.trim(),
            start_date: row.start_date || null,
            end_date: row.end_date || null,
            notes: row.notes?.trim() || null,
          })
          .eq("id", existing.id);
        if (updateErr) throw new Error(`Update "${row.name}": ${updateErr.message}`);

        // Upsert budgets — only original_budget; approved_co_amount is untouched
        const budgetRows = Object.entries(row.budgets)
          .map(([code, amount]) => {
            const normalized = code.trim().toUpperCase();
            const catId = codeToId[normalized];
            if (!catId) { unknownCodeSet.add(code); return null; }
            return {
              gate_id: existing.id,
              cost_category_id: catId,
              original_budget: amount ?? 0,
              created_by: userId,
              updated_at: new Date().toISOString(),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (budgetRows.length) {
          const { error: budgetErr } = await supabase
            .from("gate_budgets")
            .upsert(budgetRows, {
              onConflict: "gate_id,cost_category_id",
              ignoreDuplicates: false,
            });
          if (budgetErr) throw new Error(`Budgets for "${row.name}": ${budgetErr.message}`);
        }

        processedGateIds.push(existing.id);
        updated++;
      } else {
        // Insert new gate
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
        if (gateErr) throw new Error(`Insert "${row.name}": ${gateErr.message}`);

        const budgetRows = Object.entries(row.budgets)
          .map(([code, amount]) => {
            const normalized = code.trim().toUpperCase();
            const catId = codeToId[normalized];
            if (!catId) { unknownCodeSet.add(code); return null; }
            return {
              gate_id: gate.id,
              cost_category_id: catId,
              original_budget: amount ?? 0,
              created_by: userId,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (budgetRows.length) {
          const { error: budgetErr } = await supabase
            .from("gate_budgets")
            .insert(budgetRows);
          if (budgetErr) throw new Error(`Budgets for "${row.name}": ${budgetErr.message}`);
        }

        processedGateIds.push(gate.id);
        created++;
      }
    }

    await insertAuditLog({
      user_id: userId,
      action: "gate.upload_bulk",
      entity_type: "gate",
      project_id: projectId,
      label: `${created} created, ${updated} updated`,
      payload: { created, updated, gate_count: rows.length },
    });

    revalidatePath(`/projects/${projectId}`);
    // Also revalidate each gate detail page so the client router cache is cleared
    for (const gateId of processedGateIds) {
      revalidatePath(`/projects/${projectId}/gates/${gateId}`);
    }
    const unknownCodes = unknownCodeSet.size > 0 ? [...unknownCodeSet] : undefined;
    return { created, updated, unknownCodes };
  } catch (err) {
    console.error("[uploadGates]", err);
    return { error: err instanceof Error ? err.message : "Upload failed", created: 0, updated: 0 };
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
      .upsert(upsertRows, { onConflict: "gate_id,cost_category_id", ignoreDuplicates: false });

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.budget_update",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
      label: `${rows.length} line${rows.length !== 1 ? "s" : ""} saved`,
      payload: { row_count: rows.length },
    });

    revalidatePath(`/projects/${projectId}/gates/${gateId}`);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[upsertGateBudgets]", err);
    return { error: err instanceof Error ? err.message : "Failed to save budgets" };
  }
}

export async function deleteGate(
  gateId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireAdmin();

    const { data: gate } = await supabase
      .from("gates")
      .select("is_locked")
      .eq("id", gateId)
      .single();

    if (gate?.is_locked) throw new Error("Locked gates cannot be deleted");

    const { error } = await supabase.from("gates").delete().eq("id", gateId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.delete",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[deleteGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete gate" };
  }
}

export async function getMyRole(): Promise<string | null> {
  try {
    const userId = (await headers()).get("x-clerk-user-id");
    if (!userId) return null;
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    return data?.role ?? null;
  } catch {
    return null;
  }
}

export async function reopenGate(
  gateId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireAdmin();

    const { error } = await supabase
      .from("gates")
      .update({
        status: "active",
        is_locked: false,
        closed_at: null,
        closed_by: null,
      })
      .eq("id", gateId)
      .eq("status", "closed");

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "gate.reopen",
      entity_type: "gate",
      entity_id: gateId,
      project_id: projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/gates/${gateId}`);
    return {};
  } catch (err) {
    console.error("[reopenGate]", err);
    return { error: err instanceof Error ? err.message : "Failed to reopen gate" };
  }
}

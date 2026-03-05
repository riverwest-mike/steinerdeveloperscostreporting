"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/lib/audit";

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

async function requireAdmin() {
  const { userId } = await auth();
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

function revalidateProject(projectId: string, contractId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (contractId) revalidatePath(`/projects/${projectId}/contracts/${contractId}`);
}

// ── Contracts ────────────────────────────────────────────────

export async function createContract(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const gateIds = formData.getAll("gate_ids") as string[];
    if (!gateIds.length) throw new Error("At least one gate must be selected");

    const payload = {
      project_id: projectId,
      // Keep gate_id as the first selected gate for CO creation defaults
      gate_id: gateIds[0],
      cost_category_id: formData.get("cost_category_id") as string,
      vendor_name: (formData.get("vendor_name") as string).trim(),
      contract_number: (formData.get("contract_number") as string)?.trim() || null,
      description: (formData.get("description") as string).trim(),
      original_value: parseFloat(formData.get("original_value") as string) || 0,
      retainage_pct: parseFloat(formData.get("retainage_pct") as string) || 0,
      execution_date: (formData.get("execution_date") as string) || null,
      substantial_completion_date: (formData.get("substantial_completion_date") as string) || null,
      status: (formData.get("status") as string) || "active",
      teams_url: (formData.get("teams_url") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      created_by: userId,
    };

    const { data: contract, error } = await supabase
      .from("contracts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Sync contract_gates junction table
    const { error: cgErr } = await supabase.from("contract_gates").insert(
      gateIds.map((gateId) => ({ contract_id: contract.id, gate_id: gateId }))
    );
    if (cgErr) throw new Error(cgErr.message);

    // Insert SOV line items if provided at creation time
    const sovRaw = formData.get("sov_lines") as string | null;
    if (sovRaw) {
      const sovLines = JSON.parse(sovRaw) as { cost_category_id: string; description: string | null; amount: number }[];
      if (sovLines.length > 0) {
        const { error: sovErr } = await supabase.from("contract_line_items").insert(
          sovLines.map((l) => ({
            contract_id: contract.id,
            cost_category_id: l.cost_category_id,
            description: l.description ?? null,
            amount: l.amount,
          }))
        );
        if (sovErr) throw new Error(`SOV: ${sovErr.message}`);
      }
    }

    await insertAuditLog({
      user_id: userId,
      action: "contract.create",
      entity_type: "contract",
      entity_id: contract.id,
      project_id: projectId,
      label: payload.vendor_name,
      payload: { vendor_name: payload.vendor_name, contract_number: payload.contract_number, original_value: payload.original_value },
    });
    revalidateProject(projectId);
    return {};
  } catch (err) {
    console.error("[createContract]", err);
    return { error: err instanceof Error ? err.message : "Failed to create contract" };
  }
}

export async function updateContract(
  contractId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const gateIds = formData.getAll("gate_ids") as string[];
    if (!gateIds.length) throw new Error("At least one gate must be selected");

    const payload = {
      gate_id: gateIds[0],
      cost_category_id: formData.get("cost_category_id") as string,
      vendor_name: (formData.get("vendor_name") as string).trim(),
      contract_number: (formData.get("contract_number") as string)?.trim() || null,
      description: (formData.get("description") as string).trim(),
      original_value: parseFloat(formData.get("original_value") as string) || 0,
      retainage_pct: parseFloat(formData.get("retainage_pct") as string) || 0,
      execution_date: (formData.get("execution_date") as string) || null,
      substantial_completion_date: (formData.get("substantial_completion_date") as string) || null,
      status: (formData.get("status") as string) || "active",
      teams_url: (formData.get("teams_url") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("contracts")
      .update(payload)
      .eq("id", contractId);
    if (error) throw new Error(error.message);

    // Re-sync contract_gates: delete all existing, then insert updated set
    await supabase.from("contract_gates").delete().eq("contract_id", contractId);
    const { error: cgErr } = await supabase.from("contract_gates").insert(
      gateIds.map((gateId) => ({ contract_id: contractId, gate_id: gateId }))
    );
    if (cgErr) throw new Error(cgErr.message);

    await insertAuditLog({
      user_id: userId,
      action: "contract.update",
      entity_type: "contract",
      entity_id: contractId,
      project_id: projectId,
      label: payload.vendor_name,
      payload: { vendor_name: payload.vendor_name, contract_number: payload.contract_number, original_value: payload.original_value },
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[updateContract]", err);
    return { error: err instanceof Error ? err.message : "Failed to update contract" };
  }
}

export async function deleteContract(
  contractId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireAdmin();

    // Delete dependent rows first (in case FK cascade is not configured)
    await supabase.from("change_orders").delete().eq("contract_id", contractId);
    await supabase.from("contract_gates").delete().eq("contract_id", contractId);
    await supabase.from("contract_line_items").delete().eq("contract_id", contractId);

    const { error } = await supabase.from("contracts").delete().eq("id", contractId);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "contract.delete",
      entity_type: "contract",
      entity_id: contractId,
      project_id: projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[deleteContract]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete contract" };
  }
}

// ── Change Orders ────────────────────────────────────────────

export async function createChangeOrder(
  contractId: string,
  projectId: string,
  costCategoryId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const gateId = formData.get("gate_id") as string;
    if (!gateId) throw new Error("A gate must be selected for this change order");

    const payload = {
      contract_id: contractId,
      project_id: projectId,
      gate_id: gateId,
      cost_category_id: costCategoryId,
      co_number: (formData.get("co_number") as string).trim(),
      description: (formData.get("description") as string).trim(),
      amount: parseFloat(formData.get("amount") as string) || 0,
      status: "proposed" as const,
      proposed_date: (formData.get("proposed_date") as string) || new Date().toISOString().split("T")[0],
      teams_url: (formData.get("teams_url") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      created_by: userId,
    };

    const { error } = await supabase.from("change_orders").insert(payload);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.create",
      entity_type: "change_order",
      project_id: projectId,
      label: `${payload.co_number} — ${payload.description}`,
      payload: { co_number: payload.co_number, description: payload.description, amount: payload.amount },
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[createChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to create change order" };
  }
}

export async function approveChangeOrder(
  coId: string,
  contractId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    // Mark CO approved
    const { data: co, error: coErr } = await supabase
      .from("change_orders")
      .update({
        status: "approved",
        approved_date: new Date().toISOString().split("T")[0],
        approved_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", coId)
      .select("gate_id, cost_category_id, contract_id")
      .single();

    if (coErr) throw new Error(coErr.message);

    // Recalculate contract approved_co_amount
    const { data: coSum } = await supabase
      .from("change_orders")
      .select("amount")
      .eq("contract_id", contractId)
      .eq("status", "approved");

    const contractCoTotal = (coSum ?? []).reduce(
      (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
    );

    await supabase
      .from("contracts")
      .update({ approved_co_amount: contractCoTotal, updated_at: new Date().toISOString() })
      .eq("id", contractId);

    // Recalculate gate_budgets approved_co_amount for this gate+category
    const { data: budgetCoSum } = await supabase
      .from("change_orders")
      .select("amount")
      .eq("gate_id", co.gate_id)
      .eq("cost_category_id", co.cost_category_id)
      .eq("status", "approved");

    const budgetCoTotal = (budgetCoSum ?? []).reduce(
      (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
    );

    await supabase
      .from("gate_budgets")
      .update({ approved_co_amount: budgetCoTotal, updated_at: new Date().toISOString() })
      .eq("gate_id", co.gate_id)
      .eq("cost_category_id", co.cost_category_id);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.approve",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[approveChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to approve change order" };
  }
}

export async function rejectChangeOrder(
  coId: string,
  contractId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { error } = await supabase
      .from("change_orders")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", coId)
      .in("status", ["proposed"]);

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.reject",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[rejectChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to reject change order" };
  }
}

export async function voidChangeOrder(
  coId: string,
  contractId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { data: co, error: coErr } = await supabase
      .from("change_orders")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .eq("id", coId)
      .select("gate_id, cost_category_id")
      .single();

    if (coErr) throw new Error(coErr.message);

    // Recalculate contract & budget totals after voiding an approved CO
    const { data: coSum } = await supabase
      .from("change_orders")
      .select("amount")
      .eq("contract_id", contractId)
      .eq("status", "approved");

    const contractCoTotal = (coSum ?? []).reduce(
      (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
    );

    await supabase
      .from("contracts")
      .update({ approved_co_amount: contractCoTotal, updated_at: new Date().toISOString() })
      .eq("id", contractId);

    const { data: budgetCoSum } = await supabase
      .from("change_orders")
      .select("amount")
      .eq("gate_id", co.gate_id)
      .eq("cost_category_id", co.cost_category_id)
      .eq("status", "approved");

    const budgetCoTotal = (budgetCoSum ?? []).reduce(
      (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
    );

    await supabase
      .from("gate_budgets")
      .update({ approved_co_amount: budgetCoTotal, updated_at: new Date().toISOString() })
      .eq("gate_id", co.gate_id)
      .eq("cost_category_id", co.cost_category_id);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.void",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[voidChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to void change order" };
  }
}

// ── Schedule of Values (SOV) line items ──────────────────────

export async function addContractLineItem(
  contractId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const { error } = await supabase.from("contract_line_items").insert({
      contract_id: contractId,
      cost_category_id: formData.get("cost_category_id") as string,
      description: (formData.get("description") as string)?.trim() || null,
      amount: parseFloat(formData.get("amount") as string) || 0,
    });
    if (error) throw new Error(error.message);
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[addContractLineItem]", err);
    return { error: err instanceof Error ? err.message : "Failed to add line item" };
  }
}

export async function updateContractLineItem(
  lineItemId: string,
  contractId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const { error } = await supabase
      .from("contract_line_items")
      .update({
        cost_category_id: formData.get("cost_category_id") as string,
        description: (formData.get("description") as string)?.trim() || null,
        amount: parseFloat(formData.get("amount") as string) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lineItemId);
    if (error) throw new Error(error.message);
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[updateContractLineItem]", err);
    return { error: err instanceof Error ? err.message : "Failed to update line item" };
  }
}

export async function deleteContractLineItem(
  lineItemId: string,
  contractId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const { error } = await supabase
      .from("contract_line_items")
      .delete()
      .eq("id", lineItemId);
    if (error) throw new Error(error.message);
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[deleteContractLineItem]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete line item" };
  }
}

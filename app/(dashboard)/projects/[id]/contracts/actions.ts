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

function revalidateProject(projectId: string, contractId?: string | null) {
  revalidatePath(`/projects/${projectId}`);
  if (contractId) revalidatePath(`/projects/${projectId}/contracts/${contractId}`);
}

/** Auto-generate a project-scoped CO number (CO-001, CO-002, …).
 *  The user may still override this in the form. */
async function nextCoNumber(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string
): Promise<string> {
  const { count } = await supabase
    .from("change_orders")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return `CO-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/** Recalculate contract.approved_co_amount after any status change. */
async function recalcContractCoTotal(
  supabase: ReturnType<typeof createAdminClient>,
  contractId: string
) {
  const { data } = await supabase
    .from("change_orders")
    .select("amount")
    .eq("contract_id", contractId)
    .eq("status", "approved");
  const total = (data ?? []).reduce(
    (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
  );
  await supabase
    .from("contracts")
    .update({ approved_co_amount: total, updated_at: new Date().toISOString() })
    .eq("id", contractId);
}

/** Recalculate gate_budgets.approved_co_amount for a gate+category pair. */
async function recalcGateBudgetCoTotal(
  supabase: ReturnType<typeof createAdminClient>,
  gateId: string,
  costCategoryId: string
) {
  const { data } = await supabase
    .from("change_orders")
    .select("amount")
    .eq("gate_id", gateId)
    .eq("cost_category_id", costCategoryId)
    .eq("status", "approved");
  const total = (data ?? []).reduce(
    (s: number, r: { amount: number }) => s + (r.amount ?? 0), 0
  );
  await supabase
    .from("gate_budgets")
    .update({ approved_co_amount: total, updated_at: new Date().toISOString() })
    .eq("gate_id", gateId)
    .eq("cost_category_id", costCategoryId);
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

    // SOV lines are always required — cost_category_id is derived from the first line
    const sovRaw = formData.get("sov_lines") as string | null;
    if (!sovRaw) throw new Error("Schedule of Values is required");
    const sovLines = JSON.parse(sovRaw) as { cost_category_id: string; description: string | null; amount: number }[];
    if (!sovLines.length) throw new Error("At least one Schedule of Values line is required");
    if (!sovLines[0].cost_category_id) throw new Error("Each Schedule of Values line must have a cost category");

    const payload = {
      project_id: projectId,
      gate_id: gateIds[0],
      cost_category_id: sovLines[0].cost_category_id,
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

    const { error: cgErr } = await supabase.from("contract_gates").insert(
      gateIds.map((gateId) => ({ contract_id: contract.id, gate_id: gateId }))
    );
    if (cgErr) throw new Error(cgErr.message);

    const { error: sovErr } = await supabase.from("contract_line_items").insert(
      sovLines.map((l) => ({
        contract_id: contract.id,
        cost_category_id: l.cost_category_id,
        description: l.description ?? null,
        amount: l.amount,
      }))
    );
    if (sovErr) throw new Error(`SOV: ${sovErr.message}`);

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

/** Create a contract-tied CO. CO number auto-generated if left blank. */
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

    const coNumber =
      (formData.get("co_number") as string)?.trim() ||
      (await nextCoNumber(supabase, projectId));

    const payload = {
      contract_id: contractId,
      project_id: projectId,
      gate_id: gateId,
      cost_category_id: costCategoryId,
      co_number: coNumber,
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

/** Create a budget-level CO not tied to any contract (e.g. owner budget adjustment).
 *  Entry point is the gate budget page. */
export async function createBudgetChangeOrder(
  projectId: string,
  gateId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const costCategoryId = formData.get("cost_category_id") as string;
    if (!costCategoryId) throw new Error("A cost category is required");

    const coNumber =
      (formData.get("co_number") as string)?.trim() ||
      (await nextCoNumber(supabase, projectId));

    const payload = {
      contract_id: null,
      project_id: projectId,
      gate_id: gateId,
      cost_category_id: costCategoryId,
      co_number: coNumber,
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
      label: `${payload.co_number} — ${payload.description} (Budget Adjustment)`,
      payload: { co_number: payload.co_number, description: payload.description, amount: payload.amount, type: "budget_adjustment" },
    });
    revalidatePath(`/projects/${projectId}/gates/${gateId}`);
    return {};
  } catch (err) {
    console.error("[createBudgetChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to create change order" };
  }
}

/** Edit a proposed CO. Locked once approved/rejected/voided. */
export async function updateChangeOrder(
  coId: string,
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const costCategoryId = formData.get("cost_category_id") as string;
    if (!costCategoryId) throw new Error("Cost category is required");

    const payload = {
      gate_id: formData.get("gate_id") as string,
      cost_category_id: costCategoryId,
      co_number: (formData.get("co_number") as string).trim(),
      description: (formData.get("description") as string).trim(),
      amount: parseFloat(formData.get("amount") as string) || 0,
      proposed_date: formData.get("proposed_date") as string,
      teams_url: (formData.get("teams_url") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("change_orders")
      .update(payload)
      .eq("id", coId)
      .eq("status", "proposed"); // only editable while proposed

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.update",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
      label: `${payload.co_number} — ${payload.description}`,
      payload: { co_number: payload.co_number, description: payload.description, amount: payload.amount },
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    console.error("[updateChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to update change order" };
  }
}

/** Delete a proposed CO (admin only). Cannot delete approved/voided COs. */
export async function deleteChangeOrder(
  coId: string,
  projectId: string,
  contractId: string | null
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireAdmin();

    const { error } = await supabase
      .from("change_orders")
      .delete()
      .eq("id", coId)
      .eq("status", "proposed");

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.delete",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[deleteChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete change order" };
  }
}

export async function approveChangeOrder(
  coId: string,
  contractId: string | null,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

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

    const resolvedContractId = contractId ?? co.contract_id ?? null;
    if (resolvedContractId) {
      await recalcContractCoTotal(supabase, resolvedContractId);
    }
    await recalcGateBudgetCoTotal(supabase, co.gate_id, co.cost_category_id);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.approve",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, resolvedContractId);
    return {};
  } catch (err) {
    console.error("[approveChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to approve change order" };
  }
}

export async function rejectChangeOrder(
  coId: string,
  contractId: string | null,
  projectId: string,
  rejectionReason?: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { error } = await supabase
      .from("change_orders")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", coId)
      .in("status", ["proposed"]);

    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.reject",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
      payload: rejectionReason ? { rejection_reason: rejectionReason } : undefined,
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
  contractId: string | null,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const { data: co, error: coErr } = await supabase
      .from("change_orders")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .eq("id", coId)
      .select("gate_id, cost_category_id, contract_id")
      .single();

    if (coErr) throw new Error(coErr.message);

    const resolvedContractId = contractId ?? co.contract_id ?? null;
    if (resolvedContractId) {
      await recalcContractCoTotal(supabase, resolvedContractId);
    }
    await recalcGateBudgetCoTotal(supabase, co.gate_id, co.cost_category_id);

    await insertAuditLog({
      user_id: userId,
      action: "change_order.void",
      entity_type: "change_order",
      entity_id: coId,
      project_id: projectId,
    });
    revalidateProject(projectId, resolvedContractId);
    return {};
  } catch (err) {
    console.error("[voidChangeOrder]", err);
    return { error: err instanceof Error ? err.message : "Failed to void change order" };
  }
}

// ── Schedule of Values (SOV) line items ──────────────────────

async function syncContractCostCategory(supabase: ReturnType<typeof createAdminClient>, contractId: string) {
  const { data: lines } = await supabase
    .from("contract_line_items")
    .select("cost_category_id, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (lines && lines.length > 0) {
    await supabase
      .from("contracts")
      .update({ cost_category_id: lines[0].cost_category_id, updated_at: new Date().toISOString() })
      .eq("id", contractId);
  }
}

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
    await syncContractCostCategory(supabase, contractId);
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
    await syncContractCostCategory(supabase, contractId);
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
    await syncContractCostCategory(supabase, contractId);
    revalidateProject(projectId, contractId);
    return {};
  } catch (err) {
    console.error("[deleteContractLineItem]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete line item" };
  }
}

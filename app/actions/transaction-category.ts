"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface UpdateResult {
  error?: string;
  categoryCode?: string;
  categoryName?: string;
}

export async function updateTransactionCostCategory(
  transactionId: string,
  categoryId: string
): Promise<UpdateResult> {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  const role = (user as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "project_manager" && role !== "accounting" && role !== "development_lead") {
    return { error: "Insufficient permissions" };
  }

  const { data: cat } = await supabase
    .from("cost_categories")
    .select("code, name")
    .eq("id", categoryId)
    .single();

  if (!cat) return { error: "Cost category not found" };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("appfolio_transactions")
    .update({
      cost_category_code: cat.code,
      cost_category_name: cat.name,
      cost_category_code_override: cat.code,
      cost_category_name_override: cat.name,
      cost_category_override_by: userId,
      cost_category_override_at: nowIso,
    })
    .eq("id", transactionId);

  if (error) return { error: error.message };

  revalidatePath("/reports/cost-detail");
  revalidatePath("/reports/cost-management");
  return { categoryCode: cat.code, categoryName: cat.name };
}

export async function clearTransactionCostCategoryOverride(
  transactionId: string
): Promise<{ error?: string }> {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return { error: "Not authenticated" };

  const supabase = createAdminClient();
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const role = (user as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "project_manager" && role !== "accounting" && role !== "development_lead") {
    return { error: "Insufficient permissions" };
  }

  const { error } = await supabase
    .from("appfolio_transactions")
    .update({
      cost_category_code_override: null,
      cost_category_name_override: null,
      cost_category_override_by: null,
      cost_category_override_at: null,
    })
    .eq("id", transactionId);

  if (error) return { error: error.message };
  revalidatePath("/reports/cost-detail");
  revalidatePath("/reports/cost-management");
  return {};
}

"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SEED_CATEGORIES } from "./seed-data";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (data?.role !== "admin") throw new Error("Unauthorized");
  return { userId, supabase };
}

export async function createCategory(formData: FormData) {
  const { userId, supabase } = await requireAdmin();

  const name = (formData.get("name") as string).trim();
  const code = (formData.get("code") as string).trim().toUpperCase();
  const description = (formData.get("description") as string).trim() || null;
  const display_order = parseInt(formData.get("display_order") as string, 10);

  if (!name || !code || isNaN(display_order)) {
    throw new Error("Name, code, and display order are required");
  }

  const { error } = await supabase.from("cost_categories").insert({
    name,
    code,
    description,
    display_order,
    created_by: userId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-categories");
}

export async function updateCategory(
  id: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  const name = (formData.get("name") as string).trim();
  const code = (formData.get("code") as string).trim().toUpperCase();
  const description = (formData.get("description") as string).trim() || null;
  const display_order = parseInt(formData.get("display_order") as string, 10);

  if (!name || !code || isNaN(display_order)) {
    throw new Error("Name, code, and display order are required");
  }

  const { error } = await supabase
    .from("cost_categories")
    .update({ name, code, description, display_order })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-categories");
}

export async function seedDefaultCategories() {
  const { userId, supabase } = await requireAdmin();

  const rows = SEED_CATEGORIES.map((c) => ({ ...c, created_by: userId }));
  const { error } = await supabase.from("cost_categories").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-categories");
}

export async function deleteCategory(id: string) {
  const { supabase } = await requireAdmin();

  // Check for FK references before attempting delete so we can show a
  // meaningful message instead of a raw Postgres constraint error.
  const [{ count: budgetCount }, { count: contractCount }] = await Promise.all([
    supabase
      .from("gate_budgets")
      .select("id", { count: "exact", head: true })
      .eq("cost_category_id", id),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("cost_category_id", id),
  ]);

  const uses: string[] = [];
  if (budgetCount) uses.push(`${budgetCount} gate budget${budgetCount > 1 ? "s" : ""}`);
  if (contractCount) uses.push(`${contractCount} contract${contractCount > 1 ? "s" : ""}`);

  if (uses.length > 0) {
    throw new Error(
      `Cannot delete: this category is referenced by ${uses.join(" and ")}. Deactivate it instead.`
    );
  }

  const { error } = await supabase.from("cost_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-categories");
}

export async function toggleCategoryActive(id: string, currentValue: boolean) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("cost_categories")
    .update({ is_active: !currentValue })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/cost-categories");
}

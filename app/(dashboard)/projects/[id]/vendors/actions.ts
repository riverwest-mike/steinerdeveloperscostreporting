"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  return { userId, role: data.role as string, supabase };
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
    throw new Error("Admin role required");
  }
  return { userId, supabase };
}

export async function addProjectVendor(
  projectId: string,
  name: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();
    const trimmed = name.trim();
    if (!trimmed) return { error: "Vendor name is required" };

    const { error } = await supabase.from("project_vendors").insert({
      project_id: projectId,
      name: trimmed,
      is_active: true,
      created_by: userId,
    });

    if (error) {
      if (error.code === "23505") return { error: `"${trimmed}" already exists for this project` };
      throw new Error(error.message);
    }

    revalidatePath(`/projects/${projectId}/vendors`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add vendor" };
  }
}

export async function setVendorActive(
  vendorId: string,
  projectId: string,
  isActive: boolean
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const { error } = await supabase
      .from("project_vendors")
      .update({ is_active: isActive })
      .eq("id", vendorId);
    if (error) throw new Error(error.message);
    revalidatePath(`/projects/${projectId}/vendors`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update vendor" };
  }
}

export async function deleteProjectVendor(
  vendorId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdmin();
    const { error } = await supabase
      .from("project_vendors")
      .delete()
      .eq("id", vendorId);
    if (error) throw new Error(error.message);
    revalidatePath(`/projects/${projectId}/vendors`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete vendor" };
  }
}

export async function renameProjectVendor(
  vendorId: string,
  projectId: string,
  newName: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const trimmed = newName.trim();
    if (!trimmed) return { error: "Vendor name is required" };

    const { error } = await supabase
      .from("project_vendors")
      .update({ name: trimmed })
      .eq("id", vendorId);

    if (error) {
      if (error.code === "23505") return { error: `"${trimmed}" already exists for this project` };
      throw new Error(error.message);
    }

    revalidatePath(`/projects/${projectId}/vendors`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to rename vendor" };
  }
}

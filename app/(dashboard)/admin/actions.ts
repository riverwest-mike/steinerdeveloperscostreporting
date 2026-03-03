"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Role = "admin" | "project_manager" | "read_only";

async function requireAdminCaller() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (data?.role !== "admin") throw new Error("Unauthorized");
  return { callerId: userId, supabase };
}

export async function updateUserRole(
  targetUserId: string,
  newRole: Role
): Promise<{ error?: string }> {
  try {
    const { callerId, supabase } = await requireAdminCaller();
    if (targetUserId === callerId) return { error: "You cannot change your own role" };

    const { error: dbError } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", targetUserId);
    if (dbError) throw new Error(dbError.message);

    const clerk = await clerkClient();
    await clerk.users.updateUser(targetUserId, { publicMetadata: { role: newRole } });

    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update role" };
  }
}

export async function toggleUserActive(targetUserId: string): Promise<{ error?: string }> {
  try {
    const { callerId, supabase } = await requireAdminCaller();
    if (targetUserId === callerId) return { error: "You cannot deactivate your own account" };

    const { data: target } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", targetUserId)
      .single();
    if (!target) return { error: "User not found" };

    const { error } = await supabase
      .from("users")
      .update({ is_active: !target.is_active })
      .eq("id", targetUserId);
    if (error) throw new Error(error.message);

    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update status" };
  }
}

export async function assignUserToProject(
  targetUserId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { callerId, supabase } = await requireAdminCaller();
    const { error } = await supabase.from("project_users").insert({
      user_id: targetUserId,
      project_id: projectId,
      assigned_by: callerId,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign user" };
  }
}

export async function removeUserFromProject(
  targetUserId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdminCaller();
    const { error } = await supabase
      .from("project_users")
      .delete()
      .eq("user_id", targetUserId)
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove user" };
  }
}

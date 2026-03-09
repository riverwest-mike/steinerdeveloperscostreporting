"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Role = "admin" | "project_manager" | "read_only";

export async function inviteUser(
  email: string,
  role: Role
): Promise<{ error?: string }> {
  try {
    await requireAdminCaller();
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-up`,
      ignoreExisting: false,
    });
    revalidatePath("/admin");
    return {};
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already been invited") || msg.includes("duplicate")) {
      return { error: "An invitation has already been sent to that address." };
    }
    return { error: msg || "Failed to send invitation" };
  }
}

async function requireAdminCaller() {
  const userId = (await headers()).get("x-clerk-user-id");
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

export async function getPendingInvites(): Promise<{
  invites?: Array<{ id: string; emailAddress: string; role: string; createdAt: number; status: string }>;
  error?: string;
}> {
  try {
    await requireAdminCaller();
    const clerk = await clerkClient();
    const { data: invitations } = await clerk.invitations.getInvitationList({ status: "pending" });
    const invites = invitations.map((inv) => ({
      id: inv.id,
      emailAddress: inv.emailAddress,
      role: (inv.publicMetadata as Record<string, string>)?.role ?? "read_only",
      createdAt: inv.createdAt,
      status: inv.status,
    }));
    return { invites };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to fetch invitations" };
  }
}

export async function revokeInvite(inviteId: string): Promise<{ error?: string }> {
  try {
    await requireAdminCaller();
    const clerk = await clerkClient();
    await clerk.invitations.revokeInvitation(inviteId);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to revoke invitation" };
  }
}

"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Role = "admin" | "project_manager" | "read_only" | "accounting";

export async function inviteUser(
  email: string,
  role: Role,
  projectIds: string[] = []
): Promise<{ error?: string }> {
  try {
    const { callerId, supabase } = await requireAdminCaller();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set — cannot generate a valid invitation link. Add it to your environment variables.");
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
      redirectUrl: `${appUrl}/sign-up`,
      ignoreExisting: false,
    });
    // Store project assignments in DB so they can be managed after invite is sent.
    if (projectIds.length > 0) {
      await supabase.from("pending_project_assignments").insert(
        projectIds.map((projectId) => ({
          invite_email: email,
          project_id: projectId,
          assigned_by: callerId,
        }))
      );
    }
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
    if (dbError) {
      if (dbError.message.includes("users_role_check")) {
        return {
          error:
            "Database migration required: the 'accounting' role is not yet in the role constraint. " +
            "Go to Admin → AppFolio → Apply Pending Migrations, or run this SQL in the Supabase SQL Editor:\n\n" +
            "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;\n" +
            "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'project_manager', 'read_only', 'accounting'));",
        };
      }
      throw new Error(dbError.message);
    }

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

export async function assignPendingInviteToProject(
  email: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { callerId, supabase } = await requireAdminCaller();
    const { error } = await supabase.from("pending_project_assignments").upsert(
      { invite_email: email, project_id: projectId, assigned_by: callerId },
      { onConflict: "invite_email,project_id" }
    );
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign project to invite" };
  }
}

export async function removePendingInviteFromProject(
  email: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdminCaller();
    const { error } = await supabase
      .from("pending_project_assignments")
      .delete()
      .eq("invite_email", email)
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove project from invite" };
  }
}

export async function getPendingInvites(): Promise<{
  invites?: Array<{ id: string; emailAddress: string; role: string; createdAt: number; status: string; projectIds: string[] }>;
  error?: string;
}> {
  try {
    const { supabase } = await requireAdminCaller();
    const clerk = await clerkClient();
    const [{ data: invitations }, { data: pendingAssigns }] = await Promise.all([
      clerk.invitations.getInvitationList({ status: "pending" }),
      supabase.from("pending_project_assignments").select("invite_email, project_id"),
    ]);

    // Build email → project_id[] map from DB
    const assignMap = new Map<string, string[]>();
    for (const a of (pendingAssigns ?? [])) {
      if (!assignMap.has(a.invite_email)) assignMap.set(a.invite_email, []);
      assignMap.get(a.invite_email)!.push(a.project_id);
    }

    const invites = invitations.map((inv) => ({
      id: inv.id,
      emailAddress: inv.emailAddress,
      role: ((inv.publicMetadata as Record<string, unknown>)?.role as string) ?? "read_only",
      projectIds: assignMap.get(inv.emailAddress) ?? [],
      createdAt: inv.createdAt,
      status: inv.status,
    }));
    return { invites };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to fetch invitations" };
  }
}

export async function revokeInvite(inviteId: string, email: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdminCaller();
    const clerk = await clerkClient();
    await clerk.invitations.revokeInvitation(inviteId);
    // Clean up any pending project assignments for this invite
    await supabase
      .from("pending_project_assignments")
      .delete()
      .eq("invite_email", email);
    revalidatePath("/admin");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to revoke invitation" };
  }
}

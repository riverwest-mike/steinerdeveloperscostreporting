"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Role = "admin" | "project_manager" | "read_only";

export async function updateUserRole(targetUserId: string, newRole: Role) {
  const { userId } = await auth();

  // Only admins can call this action
  const supabase = createAdminClient();
  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (caller?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  // Prevent an admin from changing their own role
  if (targetUserId === userId) {
    throw new Error("You cannot change your own role");
  }

  // Update Supabase
  const { error: dbError } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (dbError) throw new Error(dbError.message);

  // Update Clerk public metadata so JWT reflects the new role
  const clerk = await clerkClient();
  await clerk.users.updateUser(targetUserId, {
    publicMetadata: { role: newRole },
  });

  revalidatePath("/admin");
}

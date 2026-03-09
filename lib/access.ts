import { createAdminClient } from "./supabase/server";

/**
 * Returns the project IDs accessible to the given user.
 * Returns null for admins (no restriction — all projects visible).
 * Returns string[] for project_manager and read_only users (their assigned project IDs only).
 */
export async function getAccessibleProjectIds(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string | null
): Promise<string[] | null> {
  if (!userId) return null;

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  const role = (data as { role?: string } | null)?.role;
  if (!role || role === "admin") return null;

  const { data: access } = await supabase
    .from("project_users")
    .select("project_id")
    .eq("user_id", userId);

  return (access ?? []).map((a: { project_id: string }) => a.project_id);
}

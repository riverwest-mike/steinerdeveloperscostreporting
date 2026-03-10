import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { autoAssignGates } from "@/lib/appfolio-sync-core";

/**
 * POST /api/admin/assign-gates
 *
 * Re-runs gate auto-assignment for all (or a specific) project's transactions
 * based on bill_date falling within gate date windows.
 * Does NOT overwrite existing manual (is_override=true) assignments.
 *
 * Body: { projectId?: string }  — omit to run for all projects
 */
export async function POST(request: Request) {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  const userRole = (user as { role?: string } | null)?.role;
  if (userRole !== "admin" && userRole !== "accounting") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let projectId: string | null = null;
  try {
    const body = await request.json() as { projectId?: string };
    projectId = body.projectId ?? null;
  } catch {
    // no body — run for all projects
  }

  let projectQuery = supabase
    .from("projects")
    .select("id, appfolio_property_id")
    .not("appfolio_property_id", "is", null)
    .neq("appfolio_property_id", "");

  if (projectId) {
    projectQuery = projectQuery.eq("id", projectId);
  }

  const { data: projects, error: projErr } = await projectQuery;
  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const projectList = (projects ?? []) as { id: string; appfolio_property_id: string | null }[];
  if (projectList.length === 0) {
    return NextResponse.json({ assigned: 0, message: "No projects with AppFolio links found." });
  }

  await autoAssignGates(supabase, projectList);

  return NextResponse.json({
    success: true,
    projects_processed: projectList.length,
    message: `Gate auto-assignment complete for ${projectList.length} project${projectList.length !== 1 ? "s" : ""}.`,
  });
}

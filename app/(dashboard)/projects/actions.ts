"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { insertAuditLog } from "@/lib/audit";
import { runAppfolioSync } from "@/lib/appfolio-sync-core";

const IMAGE_BUCKET = "project-images";

// Parses the pm_user_id form field value which may be a real user ID or a
// "pending:{email}" string representing an invited-but-not-yet-accepted PM.
function parsePmValue(raw: string | null): { pm_user_id: string | null; pending_pm_email: string | null } {
  const value = raw?.trim() || "";
  if (value.startsWith("pending:")) {
    return { pm_user_id: null, pending_pm_email: value.slice("pending:".length) || null };
  }
  return { pm_user_id: value || null, pending_pm_email: null };
}

async function uploadProjectImage(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  file: File
): Promise<string> {
  // Ensure bucket exists (no-op if already created)
  await supabase.storage.createBucket(IMAGE_BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${projectId}/cover.${ext}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  // Append cache-busting timestamp so the browser picks up a newly replaced image
  return `${data.publicUrl}?t=${Date.now()}`;
}

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

export async function createProject(
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const name = (formData.get("name") as string).trim();
    const rawCode = (formData.get("code") as string | null)?.trim().toUpperCase() || "";
    const code = rawCode || name.split(/\s+/).filter(Boolean).slice(0, 4).map((w) => w[0].toUpperCase()).join("");

    // Check for duplicate name or code
    const [{ data: dupByName }, { data: dupByCode }] = await Promise.all([
      supabase.from("projects").select("id").ilike("name", name).maybeSingle(),
      supabase.from("projects").select("id").eq("code", code).maybeSingle(),
    ]);
    if (dupByName) return { error: `A project named "${name}" already exists.` };
    if (dupByCode) return { error: `A project with code "${code}" already exists.` };

    const payload = {
      name,
      code,
      appfolio_property_id: (formData.get("appfolio_property_id") as string)?.trim() || null,
      property_type: (formData.get("property_type") as string) || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim().toUpperCase() || null,
      total_units: formData.get("total_units") ? Number(formData.get("total_units")) : null,
      total_sf: formData.get("total_sf") ? Number(formData.get("total_sf")) : null,
      acquisition_date: (formData.get("acquisition_date") as string) || null,
      expected_completion: (formData.get("expected_completion") as string) || null,
      status: (formData.get("status") as string) || "active",
      description: (formData.get("description") as string)?.trim() || null,
      ...parsePmValue(formData.get("pm_user_id") as string),
      lender: (formData.get("lender") as string)?.trim() || null,
      created_by: userId,
    };

    const { data: newProject, error } = await supabase
      .from("projects")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Upload cover image if provided
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0 && newProject) {
      const imageUrl = await uploadProjectImage(supabase, newProject.id, imageFile);
      await supabase.from("projects").update({ image_url: imageUrl }).eq("id", newProject.id);
    }

    await insertAuditLog({
      user_id: userId,
      action: "project.create",
      entity_type: "project",
      entity_id: newProject?.id,
      // project_id must also be set so the admin UI's project filter picks this up
      project_id: newProject?.id,
      label: payload.name,
      payload: { name: payload.name, code: payload.code },
    });

    // If an AppFolio property is mapped, backfill transaction history immediately
    if (payload.appfolio_property_id && newProject) {
      try {
        await runAppfolioSync({
          syncType: "manual",
          triggeredBy: userId,
          propertyId: payload.appfolio_property_id,
        });
      } catch (syncErr) {
        // Project was created successfully — log the sync failure but don't surface it
        console.error("[createProject] AppFolio sync failed (project created):", syncErr);
      }
    }

    revalidatePath("/projects");
    return {};
  } catch (err) {
    console.error("[createProject]", err);
    return { error: err instanceof Error ? err.message : "Failed to create project" };
  }
}

export async function updateProject(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    // Project managers can only edit projects they are assigned to
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    if (userRow?.role === "project_manager") {
      const { data: access } = await supabase
        .from("project_users")
        .select("id")
        .eq("project_id", id)
        .eq("user_id", userId)
        .single();
      if (!access) throw new Error("You do not have permission to edit this project");
    }
    // accounting users see all projects (same as admin) — no project-scope restriction

    const newName = (formData.get("name") as string).trim();
    const newCode = (formData.get("code") as string).trim().toUpperCase();

    // Check for duplicate name or code (excluding the current project)
    const [{ data: dupByName }, { data: dupByCode }] = await Promise.all([
      supabase.from("projects").select("id").ilike("name", newName).neq("id", id).maybeSingle(),
      supabase.from("projects").select("id").eq("code", newCode).neq("id", id).maybeSingle(),
    ]);
    if (dupByName) return { error: `A project named "${newName}" already exists.` };
    if (dupByCode) return { error: `A project with code "${newCode}" already exists.` };

    const payload: Record<string, unknown> = {
      name: newName,
      code: newCode,
      appfolio_property_id: (formData.get("appfolio_property_id") as string)?.trim() || null,
      property_type: (formData.get("property_type") as string) || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim().toUpperCase() || null,
      total_units: formData.get("total_units") ? Number(formData.get("total_units")) : null,
      total_sf: formData.get("total_sf") ? Number(formData.get("total_sf")) : null,
      acquisition_date: (formData.get("acquisition_date") as string) || null,
      expected_completion: (formData.get("expected_completion") as string) || null,
      status: (formData.get("status") as string) || "active",
      description: (formData.get("description") as string)?.trim() || null,
      ...parsePmValue(formData.get("pm_user_id") as string),
      lender: (formData.get("lender") as string)?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    // Upload cover image if a new file was provided
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      payload.image_url = await uploadProjectImage(supabase, id, imageFile);
    }

    const { error } = await supabase.from("projects").update(payload).eq("id", id);
    if (error) throw new Error(error.message);

    await insertAuditLog({
      user_id: userId,
      action: "project.update",
      entity_type: "project",
      entity_id: id,
      label: payload.name as string,
      payload: { name: payload.name, code: payload.code, status: payload.status },
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return {};
  } catch (err) {
    console.error("[updateProject]", err);
    return { error: err instanceof Error ? err.message : "Failed to update project" };
  }
}

async function requireAdmin() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!data || (data.role !== "admin" && data.role !== "accounting" && data.role !== "development_lead")) throw new Error("Admin role required");
  return { userId, supabase };
}

async function requireStrictAdmin() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!data || (data.role !== "admin" && data.role !== "development_lead")) throw new Error("Admin role required");
  return { userId, supabase };
}

export async function linkAppfolioId(
  projectId: string,
  appfolioId: string
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireAdmin();
    const value = appfolioId.trim() || null;
    const { error } = await supabase
      .from("projects")
      .update({ appfolio_property_id: value, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) throw new Error(error.message);
    await insertAuditLog({
      user_id: userId,
      action: "project.link_appfolio",
      entity_type: "project",
      entity_id: projectId,
      project_id: projectId,
      label: value ?? "(unlinked)",
      payload: { appfolio_property_id: value },
    });
    revalidatePath("/admin/appfolio");
    revalidatePath("/projects");
    return {};
  } catch (err) {
    console.error("[linkAppfolioId]", err);
    return { error: err instanceof Error ? err.message : "Failed to update AppFolio ID" };
  }
}

export async function deleteProject(id: string): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requireStrictAdmin();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await insertAuditLog({
      user_id: userId,
      action: "project.delete",
      entity_type: "project",
      entity_id: id,
    });
    revalidatePath("/projects");
    return {};
  } catch (err) {
    console.error("[deleteProject]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete project" };
  }
}

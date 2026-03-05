"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const IMAGE_BUCKET = "project-images";

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
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (!data || !["admin", "project_manager"].includes(data.role)) {
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
    const { supabase } = await requirePM();

    const payload: Record<string, unknown> = {
      name: (formData.get("name") as string).trim(),
      code: (formData.get("code") as string).trim().toUpperCase(),
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
      updated_at: new Date().toISOString(),
    };

    // Upload cover image if a new file was provided
    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      payload.image_url = await uploadProjectImage(supabase, id, imageFile);
    }

    const { error } = await supabase.from("projects").update(payload).eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return {};
  } catch (err) {
    console.error("[updateProject]", err);
    return { error: err instanceof Error ? err.message : "Failed to update project" };
  }
}

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!data || data.role !== "admin") throw new Error("Admin role required");
  return { userId, supabase };
}

export async function linkAppfolioId(
  projectId: string,
  appfolioId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdmin();
    const value = appfolioId.trim() || null;
    const { error } = await supabase
      .from("projects")
      .update({ appfolio_property_id: value, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) throw new Error(error.message);
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
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/projects");
    return {};
  } catch (err) {
    console.error("[deleteProject]", err);
    return { error: err instanceof Error ? err.message : "Failed to delete project" };
  }
}

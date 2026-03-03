"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

    const payload = {
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
      created_by: userId,
    };

    const { error } = await supabase.from("projects").insert(payload);
    if (error) throw new Error(error.message);

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

    const payload = {
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

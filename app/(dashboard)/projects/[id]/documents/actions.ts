"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const BUCKET = "project-documents";

async function requirePM() {
  const userId = (await headers()).get("x-clerk-user-id");
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
  if (!data || data.role !== "admin") throw new Error("Admin role required");
  return { userId, supabase };
}

/** Ensure the storage bucket exists (no-op if already created). */
async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  await supabase.storage
    .createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 52428800, // 50 MB
      allowedMimeTypes: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "text/plain",
        "text/csv",
        "application/zip",
        "application/x-zip-compressed",
      ],
    })
    .catch(() => {}); // already exists — ignore
}

export async function uploadDocument(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { error: "Please select a file to upload" };
    if (file.size > 52428800) return { error: "File exceeds the 50 MB limit" };

    const name = (formData.get("name") as string)?.trim() || file.name;
    const category = (formData.get("category") as string) || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    await ensureBucket(supabase);

    // Path: projectId/timestamp-originalFilename  (avoids collisions)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${projectId}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { error: dbErr } = await supabase.from("project_documents").insert({
      project_id: projectId,
      name,
      url: storagePath,   // store the storage path; signed URLs are generated on demand
      category,
      notes,
      created_by: userId,
    });

    if (dbErr) {
      // Roll back storage upload if DB insert fails
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw new Error(dbErr.message);
    }

    revalidatePath(`/projects/${projectId}/documents`);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function deleteDocument(
  documentId: string,
  storagePath: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdmin();

    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});

    const { error } = await supabase
      .from("project_documents")
      .delete()
      .eq("id", documentId);

    if (error) throw new Error(error.message);

    revalidatePath(`/projects/${projectId}/documents`);
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Delete failed" };
  }
}

export async function getSignedDownloadUrl(
  storagePath: string
): Promise<{ url?: string; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60); // 1-hour expiry

    if (error) throw new Error(error.message);
    return { url: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate download link" };
  }
}

export async function updateDocumentMeta(
  documentId: string,
  projectId: string,
  name: string,
  category: string | null,
  notes: string | null
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();
    const { error } = await supabase
      .from("project_documents")
      .update({ name: name.trim(), category, notes: notes?.trim() || null })
      .eq("id", documentId);
    if (error) throw new Error(error.message);
    revalidatePath(`/projects/${projectId}/documents`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

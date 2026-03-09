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

export interface VendorDocumentUploadData {
  vendorName: string;
  projectId?: string | null;
  documentType: string;
  displayName: string;
  // COI
  insurerName?: string;
  policyNumber?: string;
  coverageType?: string;
  perOccurrenceLimit?: number | null;
  aggregateLimit?: number | null;
  additionalInsured?: boolean;
  waiverOfSubrogation?: boolean;
  // Lien Waiver
  waiverType?: string;
  waiverAmount?: number | null;
  throughDate?: string;
  // Shared
  effectiveDate?: string;
  expirationDate?: string;
  notes?: string;
}

export async function uploadVendorDocument(
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { userId, supabase } = await requirePM();

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { error: "Please select a file to upload" };
    if (file.size > 52428800) return { error: "File exceeds the 50 MB limit" };

    const vendorName = (formData.get("vendorName") as string)?.trim();
    if (!vendorName) return { error: "Vendor name is required" };

    const documentType = (formData.get("documentType") as string) || "Other";
    const displayName = (formData.get("displayName") as string)?.trim() || file.name;
    const projectId = (formData.get("projectId") as string) || null;

    // COI fields
    const insurerName = (formData.get("insurerName") as string)?.trim() || null;
    const policyNumber = (formData.get("policyNumber") as string)?.trim() || null;
    const coverageType = (formData.get("coverageType") as string)?.trim() || null;
    const perOccurrenceLimit = parseFloat(formData.get("perOccurrenceLimit") as string) || null;
    const aggregateLimit = parseFloat(formData.get("aggregateLimit") as string) || null;
    const additionalInsured = formData.get("additionalInsured") === "true";
    const waiverOfSubrogation = formData.get("waiverOfSubrogation") === "true";

    // Lien Waiver fields
    const waiverType = (formData.get("waiverType") as string) || null;
    const waiverAmount = parseFloat(formData.get("waiverAmount") as string) || null;
    const throughDate = (formData.get("throughDate") as string) || null;

    // Shared date fields
    const effectiveDate = (formData.get("effectiveDate") as string) || null;
    const expirationDate = (formData.get("expirationDate") as string) || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    // Upload file to storage under vendors/ prefix
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeVendor = vendorName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `vendors/${safeVendor}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { error: dbErr } = await supabase.from("vendor_documents").insert({
      vendor_name: vendorName,
      project_id: projectId || null,
      document_type: documentType,
      display_name: displayName,
      storage_path: storagePath,
      insurer_name: insurerName,
      policy_number: policyNumber,
      coverage_type: coverageType,
      per_occurrence_limit: perOccurrenceLimit,
      aggregate_limit: aggregateLimit,
      additional_insured: documentType === "COI" ? additionalInsured : null,
      waiver_of_subrogation: documentType === "COI" ? waiverOfSubrogation : null,
      waiver_type: waiverType,
      waiver_amount: waiverAmount,
      through_date: throughDate || null,
      effective_date: effectiveDate || null,
      expiration_date: expirationDate || null,
      notes,
      created_by: userId,
    });

    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw new Error(dbErr.message);
    }

    revalidatePath(`/vendors/${encodeURIComponent(vendorName)}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function deleteVendorDocument(
  documentId: string,
  storagePath: string,
  vendorName: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireAdmin();

    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});

    const { error } = await supabase
      .from("vendor_documents")
      .delete()
      .eq("id", documentId);

    if (error) throw new Error(error.message);

    revalidatePath(`/vendors/${encodeURIComponent(vendorName)}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Delete failed" };
  }
}

export async function updateVendorDocument(
  documentId: string,
  vendorName: string,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requirePM();

    const documentType = formData.get("documentType") as string;
    const displayName = (formData.get("displayName") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    // COI fields
    const insurerName = (formData.get("insurerName") as string)?.trim() || null;
    const policyNumber = (formData.get("policyNumber") as string)?.trim() || null;
    const coverageType = (formData.get("coverageType") as string)?.trim() || null;
    const perOccurrenceLimit = parseFloat(formData.get("perOccurrenceLimit") as string) || null;
    const aggregateLimit = parseFloat(formData.get("aggregateLimit") as string) || null;
    const additionalInsured = formData.get("additionalInsured") === "true";
    const waiverOfSubrogation = formData.get("waiverOfSubrogation") === "true";

    // Lien Waiver fields
    const waiverType = (formData.get("waiverType") as string) || null;
    const waiverAmount = parseFloat(formData.get("waiverAmount") as string) || null;
    const throughDate = (formData.get("throughDate") as string) || null;

    // Shared date fields
    const effectiveDate = (formData.get("effectiveDate") as string) || null;
    const expirationDate = (formData.get("expirationDate") as string) || null;

    const { error } = await supabase
      .from("vendor_documents")
      .update({
        display_name: displayName,
        notes,
        insurer_name: insurerName,
        policy_number: policyNumber,
        coverage_type: coverageType,
        per_occurrence_limit: perOccurrenceLimit,
        aggregate_limit: aggregateLimit,
        additional_insured: documentType === "COI" ? additionalInsured : null,
        waiver_of_subrogation: documentType === "COI" ? waiverOfSubrogation : null,
        waiver_type: waiverType,
        waiver_amount: waiverAmount,
        through_date: throughDate || null,
        effective_date: effectiveDate || null,
        expiration_date: expirationDate || null,
      })
      .eq("id", documentId);

    if (error) throw new Error(error.message);

    revalidatePath(`/vendors/${encodeURIComponent(vendorName)}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function getVendorDocumentSignedUrl(
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

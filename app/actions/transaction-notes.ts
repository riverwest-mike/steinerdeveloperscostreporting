"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

export async function upsertTransactionNote(
  appfolioBillId: string,
  note: string
): Promise<{ error?: string }> {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  const { error } = await supabase.from("transaction_notes").upsert(
    {
      appfolio_bill_id: appfolioBillId,
      note: note.trim(),
      updated_by: userId,
      updated_at: new Date().toISOString(),
      // Only set created_by on insert (upsert won't overwrite if already set via ignoreDuplicates=false)
      created_by: userId,
    },
    { onConflict: "appfolio_bill_id" }
  );

  if (error) return { error: error.message };
  return {};
}

export async function deleteTransactionNote(
  appfolioBillId: string
): Promise<{ error?: string }> {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return { error: "Not authenticated" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("transaction_notes")
    .delete()
    .eq("appfolio_bill_id", appfolioBillId);

  if (error) return { error: error.message };
  return {};
}

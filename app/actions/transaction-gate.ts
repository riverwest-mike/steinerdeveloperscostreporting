"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

export async function updateTransactionGate(
  transactionId: string,
  gateId: string
): Promise<{ error?: string }> {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return { error: "Not authenticated" };

  const supabase = createAdminClient();

  // Verify user is admin or PM
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  const role = (user as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "project_manager" && role !== "accounting" && role !== "development_lead") {
    return { error: "Insufficient permissions" };
  }

  const { error } = await supabase
    .from("transaction_gate_assignments")
    .upsert(
      {
        appfolio_transaction_id: transactionId,
        gate_id: gateId,
        is_override: true,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "appfolio_transaction_id" }
    );

  if (error) return { error: error.message };
  return {};
}

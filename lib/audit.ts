import { createAdminClient } from "./supabase/server";

export interface AuditEntry {
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  project_id?: string;
  label?: string;
  payload?: Record<string, unknown>;
}

/** Fire-and-forget audit log insert. Never throws — failures are logged to console only. */
export async function insertAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    // The Supabase JS client never throws for DB-level errors — it returns
    // { error } instead. Destructure so we can surface those failures.
    const { error } = await supabase.from("audit_logs").insert(entry);
    if (error) {
      console.error("[audit] insert failed:", error.message, entry);
    }
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}

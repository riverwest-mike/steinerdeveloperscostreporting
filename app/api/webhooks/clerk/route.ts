import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  // Verify the webhook signature
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[webhook] svix verify failed:", err);
    return NextResponse.json(
      { error: "Invalid signature", detail: String(err) },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { type: eventType, data } = evt;

  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name, public_metadata } = data;

    // Invited users carry a `role` in publicMetadata. Users created directly in
    // Clerk (admin dashboard adds, self-signups) have none — provision them as
    // inactive read_only so they appear on the Users & Access page; the
    // dashboard layout will keep them out until an admin activates them.
    const invitedRole = (public_metadata?.role as string | undefined)?.toLowerCase();
    const role = invitedRole ?? "read_only";
    const isActive = Boolean(invitedRole);

    const email = email_addresses?.[0]?.email_address ?? "";
    const full_name = [first_name, last_name].filter(Boolean).join(" ") || email;

    const { error } = await supabase.from("users").insert({
      id,
      email,
      full_name,
      role,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Project auto-assignment only applies to invited users.
    if (!invitedRole) {
      return NextResponse.json({ received: true });
    }

    // Auto-assign the new user to any projects queued in pending_project_assignments.
    // Also merges legacy projectIds from Clerk metadata (invites sent before this table existed).
    const { data: pendingAssigns } = await supabase
      .from("pending_project_assignments")
      .select("project_id")
      .eq("invite_email", email);

    const dbProjectIds = (pendingAssigns ?? []).map((r: { project_id: string }) => r.project_id);
    const metaProjectIds = Array.isArray(public_metadata?.projectIds)
      ? (public_metadata.projectIds as string[])
      : [];
    const projectIds = [...new Set([...dbProjectIds, ...metaProjectIds])];

    if (projectIds.length > 0) {
      const rows = projectIds.map((projectId) => ({
        user_id: id,
        project_id: projectId,
        assigned_by: id,
      }));
      const { error: assignError } = await supabase.from("project_users").insert(rows);
      if (assignError) {
        console.error("[webhook] project_users insert error:", assignError);
      }
    }

    // Clean up pending assignments — user now exists in project_users.
    if (dbProjectIds.length > 0) {
      await supabase
        .from("pending_project_assignments")
        .delete()
        .eq("invite_email", email);
    }
  }

  if (eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, public_metadata } = data;

    // Only update records that already exist (invited users).
    // Never auto-create on update — that would bypass the invite gate.
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ received: true });
    }

    const email = email_addresses?.[0]?.email_address ?? "";
    const full_name = [first_name, last_name].filter(Boolean).join(" ") || email;
    const role = (public_metadata?.role as string | undefined)?.toLowerCase() || undefined;

    const { error } = await supabase
      .from("users")
      .update({
        email,
        full_name,
        ...(role ? { role } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (eventType === "session.created") {
    const { user_id } = data as { user_id: string };

    if (user_id) {
      // Update last_login_at on the user record (only if they exist in Supabase).
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("id", user_id)
        .single();

      if (existing) {
        await supabase
          .from("users")
          .update({ last_login_at: now, updated_at: now })
          .eq("id", user_id);

        // Write a login audit entry.
        await supabase.from("audit_logs").insert({
          user_id,
          action: "user.login",
          entity_type: "user",
          entity_id: user_id,
          label: "Signed in",
        });
      }
    }
  }

  if (eventType === "user.deleted") {
    const { id } = data;
    if (id) {
      const { error } = await supabase
        .from("users")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        console.error("Supabase soft-delete error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}

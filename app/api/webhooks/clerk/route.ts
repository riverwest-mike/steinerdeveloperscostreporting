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

    // Only provision users who signed up via an admin invitation.
    // Invitations carry a `role` in publicMetadata; direct sign-ups have none.
    const role = public_metadata?.role as string | undefined;
    if (!role) {
      // No invitation metadata — leave this Clerk user without a Supabase record.
      // The dashboard layout will redirect them to /not-invited.
      console.log(`[webhook] user.created for ${id} has no invitation metadata — skipping provisioning`);
      return NextResponse.json({ received: true });
    }

    const email = email_addresses?.[0]?.email_address ?? "";
    const full_name = [first_name, last_name].filter(Boolean).join(" ") || email;

    const { error } = await supabase.from("users").insert({
      id,
      email,
      full_name,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    const role = (public_metadata?.role as string) || undefined;

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

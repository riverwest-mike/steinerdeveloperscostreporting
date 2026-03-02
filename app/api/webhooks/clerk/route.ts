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
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { type: eventType, data } = evt;

  if (eventType === "user.created" || eventType === "user.updated") {
    const {
      id,
      email_addresses,
      first_name,
      last_name,
      public_metadata,
    } = data;

    const email = email_addresses?.[0]?.email_address ?? "";
    const full_name = [first_name, last_name].filter(Boolean).join(" ") || email;
    const role = (public_metadata?.role as string) || "read_only";

    const { error } = await supabase.from("users").upsert(
      {
        id,
        email,
        full_name,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Supabase upsert error:", error);
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

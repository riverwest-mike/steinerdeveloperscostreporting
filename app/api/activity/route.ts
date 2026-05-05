import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) return NextResponse.json({}, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    path?: string;
    metadata?: Record<string, unknown>;
  };

  const action = typeof body.action === "string" ? body.action.slice(0, 100) : "page_view";
  const path = typeof body.path === "string" ? body.path.slice(0, 500) : null;

  // Silently discard any insert error — activity logging must not surface to users.
  await createAdminClient()
    .from("user_activity_logs")
    .insert({ user_id: userId, action, path, metadata: body.metadata ?? null })
    .then(() => {})
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

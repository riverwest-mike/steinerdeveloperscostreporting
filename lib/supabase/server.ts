import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * Creates a Supabase server client authenticated with the Clerk JWT.
 * Use this in Server Components and API routes.
 * RLS policies will evaluate against the Clerk user ID via auth.uid().
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  const supabaseToken = await getToken({ template: "supabase" });

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: supabaseToken
          ? { Authorization: `Bearer ${supabaseToken}` }
          : {},
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Partial<ResponseCookie> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookie writes are ignored
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client using the service role key.
 * Bypasses RLS — use ONLY in trusted server-side contexts (webhooks, cron jobs).
 */
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

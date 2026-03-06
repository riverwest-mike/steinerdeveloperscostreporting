export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // userId is injected by middleware via NextResponse.next({ request: { headers } }).
  // This avoids Clerk's internal x-middleware-rewrite propagation which is unreliable
  // in some Vercel Edge → Node.js configurations with @clerk/nextjs v6.39+.
  const headersList = await headers();
  const userId = headersList.get("x-clerk-user-id");

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch user role via admin client — server-side, already Clerk-authenticated,
  // so there is no need to go through RLS here.
  const admin = createAdminClient();
  let { data: user } = await admin
    .from("users")
    .select("role, full_name, is_active")
    .eq("id", userId)
    .single();

  // If the user signed up without an invitation they won't have a Supabase
  // record yet (the webhook only creates one when the Clerk user.created event
  // fires, which requires the invitation flow). Redirect them to a "not invited"
  // page rather than auto-provisioning them.
  if (!user) {
    redirect("/not-invited");
  }

  const role = user?.role ?? "read_only";
  const isActive = user?.is_active ?? true;

  if (!isActive) {
    redirect("/sign-in?error=inactive");
  }

  return (
    <DashboardShell role={role}>
      {children}
    </DashboardShell>
  );
}

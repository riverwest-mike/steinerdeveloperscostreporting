export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { QuickStartTrigger } from "@/components/quickstart/quickstart-trigger";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

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
    <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
      <QuickStartTrigger />
    </div>
  );
}

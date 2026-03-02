export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Fetch user role from Supabase
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("role, full_name, is_active")
    .eq("id", userId)
    .single();

  // If user record doesn't exist yet (first login before webhook fires),
  // show a loading state rather than crashing
  const role = user?.role ?? "read_only";
  const isActive = user?.is_active ?? true;

  if (!isActive) {
    redirect("/sign-in?error=inactive");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

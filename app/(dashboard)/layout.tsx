export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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
  let { data: user } = await supabase
    .from("users")
    .select("role, full_name, is_active")
    .eq("id", userId)
    .single();

  // Self-registration fallback: if the webhook hasn't fired yet (or failed),
  // create the user record now so the app never crashes on first login.
  if (!user) {
    try {
      const clerkUser = await currentUser();
      if (clerkUser) {
        const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
        const full_name =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          email;
        const role =
          (clerkUser.publicMetadata?.role as string) || "read_only";
        const admin = createAdminClient();
        // INSERT only — never overwrite an existing record's role
        await admin.from("users").insert(
          { id: userId, email, full_name, role, is_active: true }
        ).onConflictDoNothing();
        // Re-fetch so we get whatever role is actually stored
        const { data: newUser } = await admin
          .from("users")
          .select("role, full_name, is_active")
          .eq("id", userId)
          .single();
        user = newUser;
      }
    } catch (err) {
      console.error("[layout] self-registration fallback failed:", err);
    }
  }

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

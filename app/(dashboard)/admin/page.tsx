export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectAccessSection } from "./project-access";
import { UsersSection } from "./users-section";

export default async function AdminPage() {
  const { userId } = await auth();
  const supabase = createAdminClient();

  // Server-side role check — redirect non-admins
  const { data: user } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", userId!)
    .single();

  if (user?.role !== "admin") {
    redirect("/dashboard");
  }

  const [{ data: users }, { data: projects }, { data: projectUsers }] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_users").select("project_id, user_id"),
  ]);

  return (
    <div>
      <Header title="Admin" />
      <div className="p-6 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Panel</h2>
          <p className="text-muted-foreground mt-1">
            Manage users, cost categories, and system settings.
          </p>
        </div>

        {/* Users table with inline Add User */}
        <UsersSection
          users={(users ?? []) as { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string }[]}
          currentUserId={userId!}
        />

        {/* Project Access */}
        <ProjectAccessSection
          projects={(projects ?? []) as { id: string; name: string; code: string }[]}
          users={(users ?? []) as { id: string; full_name: string; email: string; role: string }[]}
          assignments={(projectUsers ?? []) as { project_id: string; user_id: string }[]}
        />

      </div>
    </div>
  );
}

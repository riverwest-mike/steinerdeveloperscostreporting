export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { getPendingInvites } from "../actions";
import { UsersSection } from "../users-section";
import { HELP } from "@/lib/help";

export default async function AdminUsersPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", userId!)
    .single();

  if (user?.role !== "admin" && user?.role !== "development_lead") {
    redirect("/dashboard");
  }

  const [
    { data: users },
    { data: projects },
    { data: projectUsers },
    { invites: pendingInvites },
  ] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_users").select("project_id, user_id"),
    getPendingInvites(),
  ]);

  return (
    <div>
      <Header title="Users & Access" helpContent={HELP.adminUsers} />
      <div className="p-4 sm:p-6 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users & Access</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage user accounts, roles, and project assignments.
          </p>
        </div>

        <UsersSection
          users={(users ?? []) as { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string }[]}
          currentUserId={userId!}
          pendingInvites={(pendingInvites ?? []) as { id: string; emailAddress: string; role: string; createdAt: number; status: string; projectIds: string[] }[]}
          projects={(projects ?? []) as { id: string; name: string; code: string }[]}
          assignments={(projectUsers ?? []) as { project_id: string; user_id: string }[]}
        />
      </div>
    </div>
  );
}

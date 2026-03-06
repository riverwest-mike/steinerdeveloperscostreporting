export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectAccessSection } from "../project-access";
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

  if (user?.role !== "admin") {
    redirect("/dashboard");
  }

  const [
    { data: users },
    { data: projects },
    { data: projectUsers },
  ] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_users").select("project_id, user_id"),
  ]);

  return (
    <div>
      <Header title="Users & Access" helpContent={HELP.adminUsers} />
      <div className="p-6 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users & Access</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage user accounts, roles, and project assignments.
          </p>
        </div>

        <UsersSection
          users={(users ?? []) as { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string }[]}
          currentUserId={userId!}
        />

        <ProjectAccessSection
          projects={(projects ?? []) as { id: string; name: string; code: string }[]}
          users={(users ?? []) as { id: string; full_name: string; email: string; role: string }[]}
          assignments={(projectUsers ?? []) as { project_id: string; user_id: string }[]}
        />

        <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground flex items-center justify-between gap-4">
          <span>Budget Import History has moved to the Audit Log.</span>
          <Link
            href="/admin/audit-log"
            className="shrink-0 rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors text-foreground"
          >
            Go to Audit Log →
          </Link>
        </div>
      </div>
    </div>
  );
}

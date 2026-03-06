export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectAccessSection } from "../project-access";
import { UsersSection } from "../users-section";
import { BudgetImportHistory } from "../budget-import-history";
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
    { data: gates },
    { data: budgetImports },
  ] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_users").select("project_id, user_id"),
    supabase.from("gates").select("id, name").order("name"),
    supabase
      .from("budget_imports")
      .select("id, project_id, gate_id, filename, row_count, imported_at, imported_by, notes")
      .order("imported_at", { ascending: false })
      .limit(200),
  ]);

  type ProjectRow = { id: string; name: string; code: string };
  type UserRow = { id: string; full_name: string; email: string };
  type GateRow = { id: string; name: string };

  const projectMap = new Map<string, { name: string; code: string }>(
    ((projects ?? []) as ProjectRow[]).map((p) => [p.id, { name: p.name, code: p.code }])
  );
  const userMap = new Map<string, { full_name: string; email: string }>(
    ((users ?? []) as UserRow[]).map((u) => [u.id, { full_name: u.full_name, email: u.email }])
  );
  const gateMap = new Map<string, { name: string }>(
    ((gates ?? []) as GateRow[]).map((g) => [g.id, { name: g.name }])
  );

  return (
    <div>
      <Header title="Users & Access" helpContent={HELP.adminUsers} />
      <div className="p-6 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users & Access</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage user accounts, roles, project assignments, and budget import history.
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

        <BudgetImportHistory
          imports={(budgetImports ?? []) as { id: string; project_id: string | null; gate_id: string | null; filename: string; row_count: number | null; imported_at: string; imported_by: string | null; notes: string | null }[]}
          projectMap={projectMap}
          userMap={userMap}
          gateMap={gateMap}
        />
      </div>
    </div>
  );
}

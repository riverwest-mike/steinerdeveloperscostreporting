export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { RoleSelect } from "./role-select";
import { ActiveToggle } from "./active-toggle";
import { ProjectAccessSection } from "./project-access";
import { InviteUserForm } from "./invite-user-form";

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

        {/* Invite User */}
        <div className="rounded-lg border p-6">
          <InviteUserForm />
        </div>

        {/* Users table */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Users</h3>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Joined</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((u: { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string }) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{u.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActiveToggle
                        userId={u.id}
                        isActive={u.is_active}
                        isSelf={u.id === userId}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        userId={u.id}
                        currentRole={u.role as "admin" | "project_manager" | "read_only"}
                        isSelf={u.id === userId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Users appear here after accepting an invitation and completing sign-up. Use the Actions column to change a user&apos;s role — you cannot change your own. Click the Status badge to activate or deactivate a user.
          </p>
        </div>

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

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectForm } from "../project-form";

export default async function NewProjectPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: currentUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  const isAdmin = currentUser?.role === "admin";

  const pmUsers = isAdmin
    ? (await supabase.from("users").select("id, full_name").eq("role", "project_manager").eq("is_active", true).order("full_name")).data ?? []
    : [];

  return (
    <div>
      <Header title="New Project" />
      <div className="p-4 sm:p-6 max-w-3xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Create Project</h2>
          <p className="text-muted-foreground mt-1">
            Add a new development project. The project code must be unique and will appear on all reports.
          </p>
        </div>
        <div className="rounded-lg border p-6 bg-card">
          <ProjectForm
            appfolioBaseUrl={process.env.APPFOLIO_DATABASE_URL}
            isAdmin={isAdmin}
            pmUsers={isAdmin ? pmUsers : undefined}
          />
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { VendorTable } from "./vendor-table";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectVendorsPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");

  const [{ data: project }, { data: userRow }, { data: vendors }] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", id).single(),
    userId
      ? supabase.from("users").select("role").eq("id", userId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("project_vendors")
      .select("id, name, is_active, created_at")
      .eq("project_id", id)
      .order("name"),
  ]);

  if (!project) notFound();

  const role = (userRow as { role?: string } | null)?.role ?? "read_only";

  if (role === "read_only") {
    if (!userId) redirect("/dashboard");
    const { data: access } = await supabase
      .from("project_users")
      .select("id")
      .eq("project_id", id)
      .eq("user_id", userId)
      .single();
    if (!access) redirect("/dashboard");
  }

  const canEdit = role === "admin" || role === "project_manager" || role === "development_lead";
  const isAdmin = role === "admin" || role === "development_lead";

  return (
    <div>
      <Header title={`Vendors — ${project.name}`} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}?tab=vendors`} className="hover:text-foreground transition-colors">{project.name}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Vendors</span>
        </nav>

        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Vendor Directory</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Project-specific vendor list for <span className="font-medium text-foreground">{project.code} — {project.name}</span>.
              Populated automatically from AppFolio syncs and contract entries.
              {canEdit && " Active vendors appear as autocomplete suggestions in contract forms."}
            </p>
          </div>
          <Link
            href={`/projects/${id}?tab=vendors`}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors shrink-0"
          >
            ← Back to Project
          </Link>
        </div>

        <VendorTable
          projectId={id}
          vendors={(vendors ?? []) as { id: string; name: string; is_active: boolean; created_at: string }[]}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { DocumentList } from "./document-list";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDocumentsPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");

  const [{ data: project }, { data: userRow }, { data: documents }] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", id).single(),
    userId
      ? supabase.from("users").select("role").eq("id", userId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("project_documents")
      .select("id, name, url, category, notes, created_at, created_by_name:users(full_name)")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();

  const role = (userRow as { role?: string } | null)?.role ?? "read_only";

  // read_only users must be assigned to the project to view it
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

  const canEdit = role === "admin" || role === "project_manager";
  const isAdmin = role === "admin";

  // Flatten the joined user name
  const docs = (documents ?? []).map((d: {
    id: string;
    name: string;
    url: string;
    category: string | null;
    notes: string | null;
    created_at: string;
    created_by_name: { full_name: string | null } | null;
  }) => ({
    id: d.id,
    name: d.name,
    url: d.url,
    category: d.category,
    notes: d.notes,
    created_at: d.created_at,
    created_by_name: d.created_by_name?.full_name ?? null,
  }));

  return (
    <div>
      <Header title={`Documents — ${project.name}`} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-foreground transition-colors">{project.name}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Documents</span>
        </nav>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Project Documents</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Files and documents for <span className="font-medium text-foreground">{project.code} — {project.name}</span>.
              {canEdit
                ? " Upload PDFs, Office files, images, and more. Download links expire after 1 hour."
                : " Download links expire after 1 hour."}
            </p>
          </div>
        </div>

        <DocumentList
          projectId={id}
          documents={docs}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

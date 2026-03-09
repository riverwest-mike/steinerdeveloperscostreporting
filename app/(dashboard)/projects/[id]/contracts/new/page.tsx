export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { NewContractForm } from "./new-contract-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewContractPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: gates }, { data: categories }, { data: vendors }] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", id).single(),
    supabase.from("gates").select("id, name, sequence_number").eq("project_id", id).order("sequence_number"),
    supabase.from("cost_categories").select("id, name, code").eq("is_active", true).order("display_order"),
    supabase.from("project_vendors").select("name").eq("project_id", id).eq("is_active", true).order("name"),
  ]);

  if (!project) notFound();

  return (
    <div>
      <Header title={`Add Contract — ${project.name}`} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-6">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span className="mx-2">/</span>
          <Link href={`/projects/${id}`} className="hover:text-foreground transition-colors">{project.name}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">Add Contract</span>
        </nav>
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold tracking-tight mb-6">Add Contract</h2>
          <div className="rounded-lg border p-6 bg-card">
            <NewContractForm
              projectId={id}
              gates={(gates ?? []) as { id: string; name: string; sequence_number: number }[]}
              categories={(categories ?? []) as { id: string; name: string; code: string }[]}
              vendors={(vendors ?? []) as { name: string }[]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

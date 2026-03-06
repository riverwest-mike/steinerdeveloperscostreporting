export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { NewGateForm } from "./new-gate-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewGatePage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: gates }] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", id).single(),
    supabase.from("gates").select("sequence_number").eq("project_id", id).order("sequence_number"),
  ]);

  if (!project) notFound();

  const nextSequence =
    gates && gates.length > 0
      ? Math.max(...(gates as { sequence_number: number }[]).map((g) => g.sequence_number)) + 1
      : 1;

  return (
    <div>
      <Header title={`Add Gate — ${project.name}`} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-6">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span className="mx-2">/</span>
          <Link href={`/projects/${id}`} className="hover:text-foreground transition-colors">{project.name}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">Add Gate</span>
        </nav>
        <div className="max-w-lg">
          <h2 className="text-xl font-bold tracking-tight mb-6">Add Gate</h2>
          <div className="rounded-lg border p-6 bg-card">
            <NewGateForm projectId={id} nextSequence={nextSequence} />
          </div>
        </div>
      </div>
    </div>
  );
}

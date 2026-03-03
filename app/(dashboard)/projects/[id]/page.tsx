export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectDetail } from "./project-detail";
import { GatesSection } from "./gates-section";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: gates }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("gates")
      .select(`
        id, name, sequence_number, status, is_locked,
        start_date, end_date, notes, created_at, closed_at,
        gate_budgets(revised_budget)
      `)
      .eq("project_id", id)
      .order("sequence_number"),
  ]);

  if (!project) notFound();

  const gatesWithTotals = (gates ?? []).map((g: { id: string; name: string; sequence_number: number; status: string; is_locked: boolean; start_date: string | null; end_date: string | null; notes: string | null; created_at: string; closed_at: string | null; gate_budgets: { revised_budget: number }[] }) => ({
    ...g,
    total_budget: (g.gate_budgets as { revised_budget: number }[]).reduce(
      (sum, b) => sum + (b.revised_budget ?? 0),
      0
    ),
    gate_budgets: undefined,
  }));

  return (
    <div>
      <Header title={project.name} />
      <div className="p-6">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{project.name}</span>
        </nav>

        <ProjectDetail project={project} />
        <GatesSection projectId={id} gates={gatesWithTotals} />
      </div>
    </div>
  );
}

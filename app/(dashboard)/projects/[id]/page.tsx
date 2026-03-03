export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectDetail } from "./project-detail";
import { GatesSection } from "./gates-section";
import { ContractsSection } from "./contracts-section";
import { getMyRole } from "./gates/actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [
    { data: project },
    { data: gates },
    { data: contracts },
    { data: categories },
    userRole,
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("gates")
      .select("id, name, sequence_number, status, is_locked, start_date, end_date, notes, created_at, closed_at, gate_budgets(revised_budget)")
      .eq("project_id", id)
      .order("sequence_number"),
    supabase
      .from("contracts")
      .select("id, vendor_name, contract_number, description, original_value, approved_co_amount, revised_value, status, gate_id, cost_category_id, gates(name, sequence_number), cost_categories(name, code)")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order"),
    getMyRole(),
  ]);

  if (!project) notFound();

  const gatesWithTotals = (gates ?? []).map((g: {
    id: string; name: string; sequence_number: number; status: string;
    is_locked: boolean; start_date: string | null; end_date: string | null;
    notes: string | null; created_at: string; closed_at: string | null;
    gate_budgets: { revised_budget: number }[];
  }) => ({
    ...g,
    total_budget: (g.gate_budgets as { revised_budget: number }[]).reduce(
      (sum, b) => sum + (b.revised_budget ?? 0), 0
    ),
    gate_budgets: undefined,
  }));

  const contractsWithNames = (contracts ?? []).map((c: {
    id: string; vendor_name: string; contract_number: string | null;
    description: string; original_value: number; approved_co_amount: number;
    revised_value: number; status: string; gate_id: string; cost_category_id: string;
    gates: { name: string; sequence_number: number } | null;
    cost_categories: { name: string; code: string } | null;
  }) => ({
    id: c.id,
    vendor_name: c.vendor_name,
    contract_number: c.contract_number,
    description: c.description,
    original_value: c.original_value,
    approved_co_amount: c.approved_co_amount,
    revised_value: c.revised_value,
    status: c.status,
    gate_id: c.gate_id,
    cost_category_id: c.cost_category_id,
    gate_name: c.gates ? `${c.gates.sequence_number}. ${c.gates.name}` : undefined,
    category_name: c.cost_categories ? `${c.cost_categories.code} — ${c.cost_categories.name}` : undefined,
  }));

  const gatesList = (gates ?? []).map((g: { id: string; name: string; sequence_number: number }) => ({
    id: g.id, name: g.name, sequence_number: g.sequence_number,
  }));

  const categoriesList = (categories ?? []) as { id: string; name: string; code: string }[];

  return (
    <div>
      <Header title={project.name} />
      <div className="p-6">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{project.name}</span>
        </nav>

        <ProjectDetail
          project={project}
          isAdmin={userRole === "admin"}
          appfolioBaseUrl={process.env.APPFOLIO_DATABASE_URL}
        />
        <GatesSection projectId={id} gates={gatesWithTotals} />
        <ContractsSection
          projectId={id}
          contracts={contractsWithNames}
          gates={gatesList}
          categories={categoriesList}
        />
      </div>
    </div>
  );
}

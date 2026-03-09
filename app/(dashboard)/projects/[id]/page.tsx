export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectDetail } from "./project-detail";
import { ProjectTabs } from "./project-tabs";
import { GatesSection } from "./gates-section";
import { ContractsSection } from "./contracts-section";
import { VendorsSection } from "./vendors-section";
import { DocumentsSection } from "./documents-section";
import { getMyRole } from "./gates/actions";
import { HELP } from "@/lib/help";

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
    { data: vendors },
    { count: documentCount },
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
      .select("id, vendor_name, contract_number, description, original_value, approved_co_amount, revised_value, status, gate_id, cost_category_id, contract_gates(gate:gates(id,name,sequence_number)), cost_categories(name, code)")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("project_vendors")
      .select("name, is_active")
      .eq("project_id", id)
      .order("name"),
    supabase
      .from("project_documents")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
    getMyRole(),
  ]);

  if (!project) notFound();

  // Non-admin users must be explicitly assigned to this project
  if (userRole === "read_only" || userRole === "project_manager") {
    const userId = (await headers()).get("x-clerk-user-id");
    if (!userId) redirect("/projects");
    const { data: access } = await supabase
      .from("project_users")
      .select("id")
      .eq("project_id", id)
      .eq("user_id", userId)
      .single();
    if (!access) redirect("/projects");
  }

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
    revised_value: number; status: string; gate_id: string | null; cost_category_id: string;
    contract_gates: { gate: { id: string; name: string; sequence_number: number } | null }[];
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
    contract_gates: c.contract_gates,
    gate_names: (c.contract_gates ?? [])
      .map((cg) => cg.gate ? `${cg.gate.sequence_number}. ${cg.gate.name}` : null)
      .filter(Boolean)
      .join(", ") || undefined,
    category_name: c.cost_categories ? `${c.cost_categories.code} — ${c.cost_categories.name}` : undefined,
  }));

  const vendorList = (vendors ?? []) as { name: string; is_active: boolean }[];
  const activeVendors = vendorList.filter((v) => v.is_active);
  const activeVendorNames = activeVendors.map((v) => v.name);

  const STATUS_STYLES: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    on_hold: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    archived: "bg-gray-100 text-gray-500",
  };

  return (
    <div>
      <Header title={project.name} helpContent={HELP.projectDetail} />
      <div className="p-4 sm:p-6">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{project.name}</span>
        </nav>

        {/* Project identity header — always visible above tabs */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_STYLES[project.status] ?? "bg-gray-100 text-gray-800"
                }`}
              >
                {project.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 font-mono text-sm">{project.code}</p>
          </div>
        </div>

        <ProjectTabs
          gateCount={gatesWithTotals.length}
          contractCount={contractsWithNames.length}
          vendorCount={activeVendors.length}
          documentCount={documentCount ?? 0}
          overview={
            <ProjectDetail
              project={project}
              isAdmin={userRole === "admin"}
              appfolioBaseUrl={process.env.APPFOLIO_DATABASE_URL}
            />
          }
          gates={<GatesSection projectId={id} gates={gatesWithTotals} />}
          contracts={<ContractsSection projectId={id} contracts={contractsWithNames} />}
          vendors={
            <VendorsSection
              projectId={id}
              activeCount={activeVendors.length}
              totalCount={vendorList.length}
              vendors={activeVendorNames}
            />
          }
          documents={<DocumentsSection projectId={id} documentCount={documentCount ?? 0} />}
        />
      </div>
    </div>
  );
}

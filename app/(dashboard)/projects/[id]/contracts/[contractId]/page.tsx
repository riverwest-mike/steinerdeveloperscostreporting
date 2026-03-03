export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ContractDetail } from "./contract-detail";

interface Props {
  params: Promise<{ id: string; contractId: string }>;
}

interface ChangeOrderRow {
  id: string;
  co_number: string;
  description: string;
  amount: number;
  status: string;
  proposed_date: string;
  approved_date: string | null;
  teams_url: string | null;
  notes: string | null;
}

export default async function ContractPage({ params }: Props) {
  const { id: projectId, contractId } = await params;
  const supabase = createAdminClient();

  const [{ data: contract }, { data: project }, { data: gates }, { data: categories }, { data: changeOrders }] =
    await Promise.all([
      supabase
        .from("contracts")
        .select("*, gate:gates(id,name,sequence_number), category:cost_categories(id,name,code)")
        .eq("id", contractId)
        .single(),
      supabase.from("projects").select("id, name, code").eq("id", projectId).single(),
      supabase
        .from("gates")
        .select("id, name, sequence_number")
        .eq("project_id", projectId)
        .order("sequence_number"),
      supabase
        .from("cost_categories")
        .select("id, name, code")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("change_orders")
        .select("id, co_number, description, amount, status, proposed_date, approved_date, teams_url, notes")
        .eq("contract_id", contractId)
        .order("proposed_date", { ascending: false }),
    ]);

  if (!contract || !project) notFound();

  return (
    <div>
      <Header title={`${contract.vendor_name} — ${project.name}`} />
      <div className="p-6">
        <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5 flex-wrap">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground transition-colors">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{contract.vendor_name}</span>
        </nav>

        <ContractDetail
          contract={contract}
          projectId={projectId}
          gates={(gates ?? []) as { id: string; name: string; sequence_number: number }[]}
          categories={(categories ?? []) as { id: string; name: string; code: string }[]}
          changeOrders={(changeOrders ?? []) as ChangeOrderRow[]}
        />
      </div>
    </div>
  );
}

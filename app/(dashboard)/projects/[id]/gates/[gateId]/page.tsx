export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { GateDetail } from "./gate-detail";
import { getMyRole } from "../actions";

interface Props {
  params: Promise<{ id: string; gateId: string }>;
}

export default async function GatePage({ params }: Props) {
  const { id: projectId, gateId } = await params;
  const supabase = createAdminClient();

  const [{ data: gate }, { data: project }, { data: categories }, { data: budgets }, userRole] =
    await Promise.all([
      supabase.from("gates").select("*").eq("id", gateId).single(),
      supabase.from("projects").select("id, name, code").eq("id", projectId).single(),
      supabase
        .from("cost_categories")
        .select("id, name, code, display_order")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("gate_budgets")
        .select("cost_category_id, original_budget, approved_co_amount, revised_budget")
        .eq("gate_id", gateId),
      getMyRole(),
    ]);

  if (!gate || !project) notFound();

  interface BudgetRecord {
    cost_category_id: string;
    original_budget: number;
    approved_co_amount: number;
    revised_budget: number;
  }

  interface CategoryRecord {
    id: string;
    name: string;
    code: string;
    display_order: number;
  }

  const budgetMap = new Map<string, BudgetRecord>(
    (budgets ?? []).map((b: BudgetRecord) => [b.cost_category_id, b])
  );

  const rows = (categories ?? []).map((cat: CategoryRecord) => {
    const b = budgetMap.get(cat.id);
    return {
      cost_category_id: cat.id,
      category_name: cat.name,
      category_code: cat.code,
      original_budget: b?.original_budget ?? 0,
      approved_co_amount: b?.approved_co_amount ?? 0,
      revised_budget: b?.revised_budget ?? 0,
    };
  });

  return (
    <div>
      <Header title={`${project.name} — ${gate.name}`} />
      <div className="p-6">
        <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1.5">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span>/</span>
          <Link
            href={`/projects/${projectId}`}
            className="hover:text-foreground transition-colors"
          >
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{gate.name}</span>
        </nav>

        <GateDetail
          gate={gate}
          projectId={projectId}
          budgetRows={rows}
          isAdmin={userRole === "admin"}
        />
      </div>
    </div>
  );
}

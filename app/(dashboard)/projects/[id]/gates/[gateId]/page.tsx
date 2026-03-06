export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { GateDetail } from "./gate-detail";
import { getMyRole } from "../actions";
import { HELP } from "@/lib/help";

interface Props {
  params: Promise<{ id: string; gateId: string }>;
}

export default async function GatePage({ params }: Props) {
  const { id: projectId, gateId } = await params;
  const supabase = createAdminClient();

  const [{ data: gate }, { data: project }, { data: categories }, { data: budgets }, { data: gateChangeOrders }, userRole] =
    await Promise.all([
      supabase.from("gates").select("*").eq("id", gateId).single(),
      supabase.from("projects").select("id, name, code, appfolio_property_id").eq("id", projectId).single(),
      supabase
        .from("cost_categories")
        .select("id, name, code, description, display_order")
        .eq("is_active", true)
        .order("display_order"),
      supabase
        .from("gate_budgets")
        .select("cost_category_id, original_budget, approved_co_amount, revised_budget")
        .eq("gate_id", gateId),
      supabase
        .from("change_orders")
        .select("id, co_number, description, amount, status, proposed_date, approved_date, teams_url, notes, rejection_reason, gate_id, cost_category_id, contract_id")
        .eq("gate_id", gateId)
        .order("proposed_date", { ascending: false }),
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
    description: string | null;
    display_order: number;
  }

  const budgetMap = new Map<string, BudgetRecord>(
    (budgets ?? []).map((b: BudgetRecord) => [b.cost_category_id, b])
  );

  // Build actuals from synced AppFolio transactions
  const actualsMap = new Map<string, number>(); // cost_category_id → total amount
  if (project.appfolio_property_id) {
    // Build code → category_id lookup (case-insensitive)
    const codeToCategory = new Map<string, string>();
    for (const cat of (categories ?? []) as CategoryRecord[]) {
      codeToCategory.set(cat.code.trim().toUpperCase(), cat.id);
    }

    // Query transactions for this property, optionally filtered by gate date range
    let txQuery = supabase
      .from("appfolio_transactions")
      .select("gl_account_id, gl_account_name, invoice_amount")
      .eq("appfolio_property_id", project.appfolio_property_id);

    if (gate.start_date) {
      txQuery = txQuery.gte("bill_date", gate.start_date);
    }
    if (gate.end_date) {
      txQuery = txQuery.lte("bill_date", gate.end_date);
    }

    const { data: transactions } = await txQuery;

    for (const tx of (transactions ?? []) as { gl_account_id: string; gl_account_name: string; invoice_amount: number }[]) {
      // Try to match GL account to cost category by code
      const glId = (tx.gl_account_id ?? "").trim().toUpperCase();
      const categoryId = codeToCategory.get(glId);
      if (categoryId) {
        actualsMap.set(categoryId, (actualsMap.get(categoryId) ?? 0) + Number(tx.invoice_amount));
      }
    }
  }

  const rows = (categories ?? []).map((cat: CategoryRecord) => {
    const b = budgetMap.get(cat.id);
    return {
      cost_category_id: cat.id,
      category_name: cat.name,
      category_code: cat.code,
      category_header: cat.description ?? "",
      original_budget: b?.original_budget ?? 0,
      approved_co_amount: b?.approved_co_amount ?? 0,
      revised_budget: b?.revised_budget ?? 0,
      actual_amount: actualsMap.get(cat.id) ?? 0,
    };
  });

  return (
    <div>
      <Header title={`${project.name} — ${gate.name}`} helpContent={HELP.gateDetail} />
      <div className="p-4 sm:p-6">
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
          categories={(categories ?? []).map((c: CategoryRecord) => ({ id: c.id, name: c.name, code: c.code }))}
          changeOrders={(gateChangeOrders ?? []) as {
            id: string; co_number: string; description: string; amount: number; status: string;
            proposed_date: string; approved_date: string | null; teams_url: string | null;
            notes: string | null; rejection_reason: string | null; gate_id: string;
            cost_category_id: string; contract_id: string | null;
          }[]}
          isAdmin={userRole === "admin"}
        />
      </div>
    </div>
  );
}

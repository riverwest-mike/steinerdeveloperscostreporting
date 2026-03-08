export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { TimeGreeting } from "@/components/time-greeting";
import { ProjectGrid, type ProjectCard } from "./project-grid";
import { RecentBills, type BillRow } from "./recent-bills";
import { PendingCOs, type PendingCO } from "./pending-cos";
import { BudgetAlerts, type OverBudgetAlert } from "./budget-alerts";
import { HELP } from "@/lib/help";
import { DashboardChatInput } from "./dashboard-chat-input";

interface RawProject {
  id: string;
  name: string;
  code: string;
  status: string;
  appfolio_property_id: string | null;
  image_url: string | null;
}
interface RawGate { id: string; project_id: string; name: string }
interface RawGateBudget { gate_id: string; cost_category_id: string; revised_budget: number }
interface RawCostCategory { id: string; name: string; code: string }
interface RawTxByCategory {
  appfolio_property_id: string;
  gl_account_id: string;
  invoice_amount: number;
}
interface RawCO {
  id: string; project_id: string; co_number: string;
  description: string; amount: number; proposed_date: string;
}
interface RawBill {
  id: string | number; bill_date: string; vendor_name: string;
  cost_category_code: string | null; cost_category_name: string | null;
  paid_amount: number; unpaid_amount: number; payment_status: string;
  appfolio_property_id: string; description: string | null;
}
interface RawSpend {
  appfolio_property_id: string; paid_amount: number; unpaid_amount: number;
}

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default async function DashboardPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Always use adminSupabase for the user lookup so role is reliably detected
  // even when the Clerk → Supabase JWT template is not yet configured.
  const { data: user } = (await adminSupabase
    .from("users")
    .select("full_name, role")
    .eq("id", userId!)
    .single()) as { data: { full_name: string; role: string } | null };

  const role = user?.role ?? "read_only";
  const isAdmin = role === "admin";

  // Admins bypass RLS — they should see all projects regardless of
  // project_users assignments and regardless of JWT template state.
  // Non-admins go through the RLS-enforced client so access is properly scoped.
  const dataClient = isAdmin ? adminSupabase : supabase;

  const { data: rawProjects } = (await dataClient
    .from("projects")
    .select("id, name, code, status, appfolio_property_id, image_url")
    .order("name")) as { data: RawProject[] | null };

  const projectList = rawProjects ?? [];
  const projectIds = projectList.map((p) => p.id);

  if (projectIds.length === 0) {
    return (
      <div>
        <Header title="Dashboard" helpContent={HELP.dashboard} />
        <div className="p-4 sm:p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              <TimeGreeting name={user?.full_name} />
            </h2>
            {isAdmin ? (
              <p className="text-muted-foreground mt-1">
                No projects have been created yet.{" "}
                <a href="/projects/new" className="text-primary underline underline-offset-2">
                  Create your first project →
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground mt-1">
                You haven&apos;t been assigned to any projects yet. Contact your admin.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active gates
  const { data: rawActiveGates } = (await dataClient
    .from("gates")
    .select("id, project_id, name")
    .in("project_id", projectIds)
    .eq("status", "active")) as { data: RawGate[] | null };

  const activeGates = rawActiveGates ?? [];
  const activeGateIds = activeGates.map((g) => g.id);

  // Gate budgets
  const { data: rawGateBudgets } = (activeGateIds.length > 0
    ? await dataClient
        .from("gate_budgets")
        .select("gate_id, cost_category_id, revised_budget")
        .in("gate_id", activeGateIds)
    : { data: [] }) as { data: RawGateBudget[] | null };

  const budgetByGate = new Map<string, number>();
  for (const gb of rawGateBudgets ?? []) {
    budgetByGate.set(gb.gate_id, (budgetByGate.get(gb.gate_id) ?? 0) + Number(gb.revised_budget));
  }
  const gateByProject = new Map<string, { name: string; budgetTotal: number }>();
  for (const g of activeGates) {
    gateByProject.set(g.project_id, { name: g.name, budgetTotal: budgetByGate.get(g.id) ?? 0 });
  }

  // Change orders (admin / PM only)
  let pendingCOs: PendingCO[] = [];
  if (role !== "read_only") {
    const { data: rawCOs } = (await dataClient
      .from("change_orders")
      .select("id, project_id, co_number, description, amount, proposed_date")
      .in("project_id", projectIds)
      .eq("status", "proposed")
      .order("proposed_date")) as { data: RawCO[] | null };

    const projectNameById = new Map(projectList.map((p) => [p.id, p.name]));
    pendingCOs = (rawCOs ?? []).map((co) => ({
      id: co.id,
      project_id: co.project_id,
      project_name: projectNameById.get(co.project_id) ?? "Unknown",
      co_number: co.co_number,
      description: co.description,
      amount: Number(co.amount),
      proposed_date: co.proposed_date,
    }));
  }

  // AppFolio transactions
  const propertyIdList = projectList
    .filter((p) => p.appfolio_property_id)
    .map((p) => p.appfolio_property_id as string);

  const { data: allSpend } = (propertyIdList.length > 0
    ? await adminSupabase
        .from("appfolio_transactions")
        .select("appfolio_property_id, paid_amount, unpaid_amount")
        .in("appfolio_property_id", propertyIdList)
        .limit(5000)
    : { data: [] }) as { data: RawSpend[] | null };

  const spentByProperty = new Map<string, number>();
  for (const t of allSpend ?? []) {
    spentByProperty.set(
      t.appfolio_property_id,
      (spentByProperty.get(t.appfolio_property_id) ?? 0) + Number(t.paid_amount) + Number(t.unpaid_amount)
    );
  }

  // Fetch cost categories and per-category actuals for budget alerts
  const [{ data: rawCategories }, { data: rawTxByCategory }] = await Promise.all([
    adminSupabase
      .from("cost_categories")
      .select("id, name, code")
      .eq("is_active", true) as Promise<{ data: RawCostCategory[] | null }>,
    propertyIdList.length > 0 && activeGateIds.length > 0
      ? adminSupabase
          .from("appfolio_transactions")
          .select("appfolio_property_id, gl_account_id, invoice_amount")
          .in("appfolio_property_id", propertyIdList)
          .limit(10000) as Promise<{ data: RawTxByCategory[] | null }>
      : Promise.resolve({ data: [] as RawTxByCategory[] }),
  ]);

  // Build lookups for budget alerts
  const codeToCategory = new Map<string, RawCostCategory>();
  for (const cat of rawCategories ?? []) {
    codeToCategory.set(cat.code.trim().toUpperCase(), cat);
  }
  const categoryById = new Map<string, RawCostCategory>();
  for (const cat of rawCategories ?? []) {
    categoryById.set(cat.id, cat);
  }

  // Aggregate actual spend per (property, cost_category_id)
  const actualsByPropertyCategory = new Map<string, number>(); // key: `${propertyId}::${categoryId}`
  for (const tx of rawTxByCategory ?? []) {
    const glId = (tx.gl_account_id ?? "").trim().toUpperCase();
    const cat = codeToCategory.get(glId);
    if (cat) {
      const key = `${tx.appfolio_property_id}::${cat.id}`;
      actualsByPropertyCategory.set(key, (actualsByPropertyCategory.get(key) ?? 0) + Number(tx.invoice_amount));
    }
  }

  // Build project → property lookup
  const projectToProperty = new Map<string, string>();
  for (const p of projectList) {
    if (p.appfolio_property_id) projectToProperty.set(p.id, p.appfolio_property_id);
  }
  const projectNameById = new Map(projectList.map((p) => [p.id, p.name]));

  // Gate → project lookup
  const gateToProject = new Map<string, string>();
  for (const g of activeGates) {
    gateToProject.set(g.id, g.project_id);
  }

  // Compute over-budget alerts per (gate, cost_category)
  const overBudgetAlerts: OverBudgetAlert[] = [];
  for (const gb of rawGateBudgets ?? []) {
    if (Number(gb.revised_budget) <= 0) continue;
    const projectId = gateToProject.get(gb.gate_id);
    if (!projectId) continue;
    const propertyId = projectToProperty.get(projectId);
    if (!propertyId) continue;
    const key = `${propertyId}::${gb.cost_category_id}`;
    const actual = actualsByPropertyCategory.get(key) ?? 0;
    const overage = actual - Number(gb.revised_budget);
    if (overage <= 0) continue;
    const cat = categoryById.get(gb.cost_category_id);
    const gate = gateByProject.get(projectId);
    overBudgetAlerts.push({
      project_id: projectId,
      project_name: projectNameById.get(projectId) ?? "Unknown",
      gate_id: gb.gate_id,
      gate_name: gate?.name ?? "",
      category_name: cat?.name ?? gb.cost_category_id,
      category_code: cat?.code ?? "",
      revised_budget: Number(gb.revised_budget),
      actual_amount: actual,
      overage,
    });
  }
  overBudgetAlerts.sort((a, b) => b.overage - a.overage);

  const ninetyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rawBills } = (propertyIdList.length > 0
    ? await adminSupabase
        .from("appfolio_transactions")
        .select(
          "id, bill_date, vendor_name, cost_category_code, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description"
        )
        .in("appfolio_property_id", propertyIdList)
        .gte("bill_date", ninetyDaysAgo)
        .order("bill_date", { ascending: false })
        .limit(1000)
    : { data: [] }) as { data: RawBill[] | null };

  const propertyToProject = new Map<string, { name: string; id: string }>();
  for (const p of projectList) {
    if (p.appfolio_property_id) {
      propertyToProject.set(p.appfolio_property_id, { name: p.name, id: p.id });
    }
  }

  const bills: BillRow[] = (rawBills ?? []).map((b) => {
    const proj = propertyToProject.get(b.appfolio_property_id);
    return {
      id: String(b.id),
      bill_date: b.bill_date,
      vendor_name: b.vendor_name,
      cost_category_code: b.cost_category_code,
      cost_category_name: b.cost_category_name,
      paid_amount: Number(b.paid_amount),
      unpaid_amount: Number(b.unpaid_amount),
      payment_status: b.payment_status,
      project_name: proj?.name ?? null,
      project_id: proj?.id ?? null,
      description: b.description,
    };
  });

  const activeProjects = projectList.filter((p) => p.status === "active");
  const portfolioValue = activeProjects.reduce(
    (sum, p) => sum + (gateByProject.get(p.id)?.budgetTotal ?? 0), 0
  );
  const totalSpent = [...spentByProperty.values()].reduce((a, b) => a + b, 0);
  const pendingCOCount = pendingCOs.length;
  const pendingCOValue = pendingCOs.reduce((sum, co) => sum + co.amount, 0);

  const projectCards: ProjectCard[] = projectList.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
    image_url: p.image_url,
    gateName: gateByProject.get(p.id)?.name ?? null,
    budgetTotal: gateByProject.get(p.id)?.budgetTotal ?? 0,
    spent: p.appfolio_property_id ? (spentByProperty.get(p.appfolio_property_id) ?? 0) : 0,
  }));

  return (
    <div>
      <Header title="Dashboard" helpContent={HELP.dashboard} />
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            <TimeGreeting name={user?.full_name} />
          </h2>
          <div className="mt-4">
            <DashboardChatInput />
          </div>
        </div>

        <p className="text-muted-foreground -mt-2 text-sm">
          Here&apos;s an overview of your construction projects.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Active Projects</p>
            <p className="mt-1 text-3xl font-bold">{activeProjects.length}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Portfolio Budget</p>
            <p className="mt-1 text-3xl font-bold">{portfolioValue > 0 ? usd(portfolioValue) : "—"}</p>
          </div>
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Total Deployed</p>
            <p className="mt-1 text-3xl font-bold">{totalSpent > 0 ? usd(totalSpent) : "—"}</p>
          </div>
          {role !== "read_only" ? (
            <div className="rounded-lg border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">Pending COs</p>
              <p className="mt-1 text-3xl font-bold">{pendingCOCount > 0 ? pendingCOCount : "—"}</p>
              {pendingCOCount > 0 && (
                <p className="text-xs text-amber-600 font-medium mt-0.5">{usd(pendingCOValue)}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">Your Role</p>
              <p className="mt-1 text-lg font-bold capitalize">{role.replace("_", " ")}</p>
            </div>
          )}
        </div>

        <ProjectGrid projects={projectCards} />

        {overBudgetAlerts.length > 0 && (
          <BudgetAlerts alerts={overBudgetAlerts} />
        )}

        <div className={`grid grid-cols-1 gap-6 ${role !== "read_only" ? "lg:grid-cols-5" : ""}`}>
          <div className={role !== "read_only" ? "lg:col-span-3" : ""}>
            <RecentBills bills={bills} />
          </div>
          {role !== "read_only" && (
            <div className="lg:col-span-2">
              <PendingCOs cos={pendingCOs} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { TimeGreeting } from "@/components/time-greeting";
import { ProjectGrid, type ProjectCard } from "./project-grid";
import { RecentBills, type BillRow } from "./recent-bills";
import { PendingCOs, type PendingCO } from "./pending-cos";

interface RawBill {
  id: string | number;
  bill_date: string;
  vendor_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  appfolio_property_id: string;
  description: string | null;
}

interface RawSpend {
  appfolio_property_id: string;
  paid_amount: number;
  unpaid_amount: number;
}

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default async function DashboardPage() {
  const { userId } = await auth();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // ── User ──────────────────────────────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", userId!)
    .single();

  const role = user?.role ?? "read_only";

  // ── Projects (RLS-scoped to this user) ────────────────────────────────────
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, appfolio_property_id, image_url")
    .order("name");

  const projectList = projects ?? [];
  const projectIds = projectList.map((p) => p.id);

  // Early-exit shell if user has no assigned projects
  if (projectIds.length === 0) {
    return (
      <div>
        <Header title="Dashboard" />
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              <TimeGreeting name={user?.full_name} />
            </h2>
            <p className="text-muted-foreground mt-1">
              You are not assigned to any projects yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Active gates (one per project) ───────────────────────────────────────
  const { data: activeGates } = await supabase
    .from("gates")
    .select("id, project_id, name")
    .in("project_id", projectIds)
    .eq("status", "active");

  const activeGateIds = (activeGates ?? []).map((g) => g.id);

  // ── Gate budgets ──────────────────────────────────────────────────────────
  const { data: gateBudgets } =
    activeGateIds.length > 0
      ? await supabase
          .from("gate_budgets")
          .select("gate_id, revised_budget")
          .in("gate_id", activeGateIds)
      : { data: [] };

  // budget per gate
  const budgetByGate = new Map<string, number>();
  for (const gb of gateBudgets ?? []) {
    budgetByGate.set(
      gb.gate_id,
      (budgetByGate.get(gb.gate_id) ?? 0) + Number(gb.revised_budget)
    );
  }

  // gate info per project
  const gateByProject = new Map<string, { name: string; budgetTotal: number }>();
  for (const g of activeGates ?? []) {
    gateByProject.set(g.project_id, {
      name: g.name,
      budgetTotal: budgetByGate.get(g.id) ?? 0,
    });
  }

  // ── Change orders (admin / PM only) ───────────────────────────────────────
  let pendingCOs: PendingCO[] = [];
  if (role !== "read_only") {
    const { data: rawCOs } = await supabase
      .from("change_orders")
      .select("id, project_id, co_number, description, amount, proposed_date")
      .in("project_id", projectIds)
      .eq("status", "proposed")
      .order("proposed_date");

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

  // ── AppFolio transactions ─────────────────────────────────────────────────
  const accessiblePropertyIds = new Set<string>(
    projectList
      .filter((p) => p.appfolio_property_id)
      .map((p) => p.appfolio_property_id as string)
  );

  const propertyIdList = [...accessiblePropertyIds];

  // All-time spend per property (for budget bars + portfolio stat)
  const { data: allSpend } =
    propertyIdList.length > 0
      ? await adminSupabase
          .from("appfolio_transactions")
          .select("appfolio_property_id, paid_amount, unpaid_amount")
          .in("appfolio_property_id", propertyIdList)
          .limit(5000)
      : { data: [] };

  const spentByProperty = new Map<string, number>();
  for (const t of (allSpend ?? []) as RawSpend[]) {
    spentByProperty.set(
      t.appfolio_property_id,
      (spentByProperty.get(t.appfolio_property_id) ?? 0) +
        Number(t.paid_amount) +
        Number(t.unpaid_amount)
    );
  }

  // Last 90 days for bills display
  const ninetyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rawBills } =
    propertyIdList.length > 0
      ? await adminSupabase
          .from("appfolio_transactions")
          .select(
            "id, bill_date, vendor_name, cost_category_code, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description"
          )
          .in("appfolio_property_id", propertyIdList)
          .gte("bill_date", ninetyDaysAgo)
          .order("bill_date", { ascending: false })
          .limit(1000)
      : { data: [] };

  // property_id → { name, id }
  const propertyToProject = new Map<string, { name: string; id: string }>();
  for (const p of projectList) {
    if (p.appfolio_property_id) {
      propertyToProject.set(p.appfolio_property_id, { name: p.name, id: p.id });
    }
  }

  const bills: BillRow[] = ((rawBills ?? []) as RawBill[]).map((b) => {
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

  // ── Stat bar aggregates ───────────────────────────────────────────────────
  const activeProjects = projectList.filter((p) => p.status === "active");

  const portfolioValue = activeProjects.reduce((sum, p) => {
    return sum + (gateByProject.get(p.id)?.budgetTotal ?? 0);
  }, 0);

  const totalSpent = [...spentByProperty.values()].reduce((a, b) => a + b, 0);

  const pendingCOCount = pendingCOs.length;
  const pendingCOValue = pendingCOs.reduce((sum, co) => sum + co.amount, 0);

  // ── Project cards ─────────────────────────────────────────────────────────
  const projectCards: ProjectCard[] = projectList.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
    image_url: p.image_url ?? null,
    gateName: gateByProject.get(p.id)?.name ?? null,
    budgetTotal: gateByProject.get(p.id)?.budgetTotal ?? 0,
    spent: p.appfolio_property_id
      ? (spentByProperty.get(p.appfolio_property_id) ?? 0)
      : 0,
  }));

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            <TimeGreeting name={user?.full_name} />
          </h2>
          <p className="text-muted-foreground mt-1">
            Here&apos;s an overview of your construction projects.
          </p>
        </div>

        {/* Stat bar */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Active Projects</p>
            <p className="mt-1 text-3xl font-bold">{activeProjects.length}</p>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Portfolio Budget</p>
            <p className="mt-1 text-3xl font-bold">
              {portfolioValue > 0 ? usd(portfolioValue) : "—"}
            </p>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Total Deployed</p>
            <p className="mt-1 text-3xl font-bold">
              {totalSpent > 0 ? usd(totalSpent) : "—"}
            </p>
          </div>

          {role !== "read_only" ? (
            <div className="rounded-lg border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">Pending COs</p>
              <p className="mt-1 text-3xl font-bold">
                {pendingCOCount > 0 ? pendingCOCount : "—"}
              </p>
              {pendingCOCount > 0 && (
                <p className="text-xs text-amber-600 font-medium mt-0.5">
                  {usd(pendingCOValue)}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">Your Role</p>
              <p className="mt-1 text-lg font-bold capitalize">
                {role.replace("_", " ")}
              </p>
            </div>
          )}
        </div>

        {/* Project grid */}
        <ProjectGrid projects={projectCards} />

        {/* Lower section: bills + COs */}
        <div
          className={`grid grid-cols-1 gap-6 ${
            role !== "read_only" ? "lg:grid-cols-5" : ""
          }`}
        >
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

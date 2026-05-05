import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

const client = new Anthropic();

const SYSTEM_PROMPT_BASE = `You are the financial assistant inside KILN, the financial control system for real estate development. You have direct access to the live database and must use your tools to answer questions with real data.

## Data access and access control
You only have access to projects and data that the logged-in user is authorized to see. Never reference, guess, or infer data for projects the user has not been granted access to. If a tool returns no results for a project, it means the user does not have access or no data exists — do not speculate.

The application tracks:
- Projects: construction projects with name, code, status, linked to AppFolio properties
- Gates: project phases (status: pending = not yet started, active = currently in progress, closed = complete). Only one gate can be active at a time per project. Use get_gates to see gate status.
- Change Orders: proposed/approved/rejected cost changes on contracts or gates
- AppFolio Transactions: bills and payments (paid_amount, unpaid_amount, payment_status, vendor_name, cost_category_name)
- Contracts: committed costs with vendors, original_value, approved_co_amount
- Cost Categories: codes and names that categorize spend (e.g. "Surveys", "Concrete", "Engineering")

## Navigation
When the user asks to go to a report or page, respond with a markdown link using the exact app path. Internal app links will be clickable and navigate directly.

Available paths:
- /reports/cost-management — Project Cost Management Report (add ?projectIds=ID to pre-select a project, &gateId=GATE_ID to filter to one gate)
- /reports/cost-detail — Cost Detail Report (add ?projectIds=ID&categoryCode=CODE)
- /reports/vendor-detail — Vendor Detail Report
- /reports/commitment-detail — Commitment Detail Report
- /reports/change-orders — Change Order Log
- /reports/balance-sheet — Balance Sheet Report
- /projects — Projects list
- /dashboard — Dashboard

Example: "Take me to the PCM report for project ABC" → call list_projects to find the project ID, then respond: [Open PCM Report for ABC](/reports/cost-management?projectIds=PROJECT_ID)

## Response guidelines
- Always call tools to get real data before answering any financial question. Never guess amounts.
- Present financial data in **markdown tables** whenever comparing multiple items, projects, or categories.
- Use **bold** for totals and key figures. Use bullet points for lists.
- Format all dollar amounts with $ and commas (e.g. $1,234,567).
- Draw clear conclusions: "Project X is 12% over budget" not just raw numbers.
- If a question spans multiple projects or categories, summarize first then show the breakdown table.
- For gate questions: clearly state which gate is currently active, which are closed, and which are pending.`;

function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return `Today is ${today}. When the user says "this year", "this month", "this week", or "today", interpret it relative to this date.\n\n${SYSTEM_PROMPT_BASE}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description:
      "List all projects the user can access, with their total budget and total deployed costs. Use this first to find project IDs or answer portfolio-level questions.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "all"],
          description: "Filter by status. Default: active.",
        },
      },
    },
  },
  {
    name: "get_project_financials",
    description:
      "Get the financial summary for one project: total budget, total committed (contracts), total incurred (paid + unpaid), and pending change order value.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project UUID from list_projects" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "summarize_spend",
    description:
      "Aggregate AppFolio transaction totals — no row limit. Use this to answer 'how much was spent on X' questions. Returns total paid and unpaid amounts. Can group by cost_category or vendor. Supports date range filtering.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Filter to one project by UUID. Omit for all accessible projects.",
        },
        cost_category: {
          type: "string",
          description: "Partial case-insensitive match on cost category name OR code (e.g. 'survey', 'concrete', '01500').",
        },
        vendor_name: {
          type: "string",
          description: "Partial case-insensitive match on vendor name.",
        },
        date_from: {
          type: "string",
          description: "Start date inclusive, format YYYY-MM-DD (e.g. '2026-01-01').",
        },
        date_to: {
          type: "string",
          description: "End date inclusive, format YYYY-MM-DD (e.g. '2026-12-31').",
        },
        group_by: {
          type: "string",
          enum: ["cost_category", "vendor", "project", "none"],
          description: "How to group the results. Default: none (returns a single total).",
        },
      },
    },
  },
  {
    name: "query_transactions",
    description:
      "Query individual AppFolio transactions with optional filters. Returns up to 30 rows sorted by bill_date descending. Use summarize_spend instead when you only need totals.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Filter to one project by project UUID",
        },
        cost_category: {
          type: "string",
          description: "Partial case-insensitive match on cost category name OR code.",
        },
        vendor_name: {
          type: "string",
          description: "Partial case-insensitive match on vendor name",
        },
        payment_status: {
          type: "string",
          enum: ["paid", "unpaid", "all"],
          description: "Default: all",
        },
        date_from: {
          type: "string",
          description: "Start date inclusive, format YYYY-MM-DD.",
        },
        date_to: {
          type: "string",
          description: "End date inclusive, format YYYY-MM-DD.",
        },
      },
    },
  },
  {
    name: "get_change_orders",
    description:
      "Get change orders, optionally filtered by project and/or status. Returns up to 30 rows.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: {
          type: "string",
          enum: ["proposed", "approved", "rejected", "voided", "all"],
          description: "Default: all",
        },
      },
    },
  },
  {
    name: "get_gates",
    description:
      "Get all gates (phases) for a project, including their status (pending/active/closed), sequence number, dates, and budget totals. Use this to answer questions about which gate is currently open, which are closed, or what phase a project is in.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Required project UUID from list_projects" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_contracts",
    description:
      "Get contracts for a project with vendor name, original value, approved CO amount, and status.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Required project UUID" },
        status: {
          type: "string",
          enum: ["active", "complete", "terminated", "all"],
          description: "Default: all",
        },
      },
      required: ["project_id"],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  accessibleProjectIds: string[],
  isAdmin: boolean
): Promise<unknown> {
  const db = createAdminClient();

  function inProjects(id: string) {
    return isAdmin ? true : accessibleProjectIds.includes(id);
  }

  // Resolve accessible property IDs (scoped to user)
  async function getScopedPropertyIds(projectId?: string): Promise<string[] | null> {
    if (projectId) {
      if (!isAdmin && !inProjects(projectId)) return null;
      const { data: proj } = await db
        .from("projects")
        .select("appfolio_property_id")
        .eq("id", projectId)
        .single();
      return proj?.appfolio_property_id ? [proj.appfolio_property_id] : [];
    }
    if (!isAdmin) {
      const { data: projs } = await db
        .from("projects")
        .select("appfolio_property_id")
        .in("id", accessibleProjectIds)
        .not("appfolio_property_id", "is", null);
      return ((projs ?? []) as { appfolio_property_id: string | null }[])
        .map((p) => p.appfolio_property_id)
        .filter((id): id is string => Boolean(id));
    }
    return null; // admin, no restriction
  }

  switch (name) {

    // ── list_projects ──────────────────────────────────────────────────────
    case "list_projects": {
      const statusFilter = (input.status as string) ?? "active";
      let q = db.from("projects").select("id, name, code, status, appfolio_property_id").order("name");
      if (statusFilter === "active") q = q.eq("status", "active");
      if (!isAdmin) q = q.in("id", accessibleProjectIds);

      const { data: rawProjects } = await q;
      const projects = (rawProjects ?? []) as { id: string; name: string; code: string; status: string; appfolio_property_id: string | null }[];
      if (!projects.length) return { projects: [] };

      const projectIds = projects.map((p) => p.id);
      const { data: rawGates } = await db.from("gates").select("id, project_id").in("project_id", projectIds);
      const gates = (rawGates ?? []) as { id: string; project_id: string }[];
      const gateIds = gates.map((g) => g.id);

      const { data: rawBudgets } = gateIds.length
        ? await db.from("gate_budgets").select("gate_id, revised_budget").in("gate_id", gateIds)
        : { data: [] };
      const budgets = (rawBudgets ?? []) as { gate_id: string; revised_budget: number }[];

      const gateToProject = new Map(gates.map((g) => [g.id, g.project_id]));
      const budgetByProject = new Map<string, number>();
      for (const b of budgets) {
        const pid = gateToProject.get(b.gate_id);
        if (pid) budgetByProject.set(pid, (budgetByProject.get(pid) ?? 0) + Number(b.revised_budget));
      }

      const propIds = projects.filter((p) => p.appfolio_property_id).map((p) => p.appfolio_property_id as string);
      const { data: rawTxSums } = propIds.length
        ? await db.from("appfolio_transactions").select("appfolio_property_id, paid_amount, unpaid_amount").in("appfolio_property_id", propIds)
        : { data: [] };
      const txSums = (rawTxSums ?? []) as { appfolio_property_id: string; paid_amount: number; unpaid_amount: number }[];

      const spendByProp = new Map<string, number>();
      for (const t of txSums) {
        spendByProp.set(t.appfolio_property_id, (spendByProp.get(t.appfolio_property_id) ?? 0) + Number(t.paid_amount) + Number(t.unpaid_amount));
      }

      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          status: p.status,
          total_budget: budgetByProject.get(p.id) ?? 0,
          total_deployed: p.appfolio_property_id ? (spendByProp.get(p.appfolio_property_id) ?? 0) : 0,
        })),
      };
    }

    // ── get_project_financials ─────────────────────────────────────────────
    case "get_project_financials": {
      const projectId = input.project_id as string;
      if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };

      const { data: project } = await db.from("projects").select("id, name, code, status, appfolio_property_id").eq("id", projectId).single();
      if (!project) return { error: "Project not found" };

      const { data: rawGates } = await db.from("gates").select("id").eq("project_id", projectId);
      const gateIds = ((rawGates ?? []) as { id: string }[]).map((g) => g.id);
      const { data: rawBudgets } = gateIds.length
        ? await db.from("gate_budgets").select("revised_budget").in("gate_id", gateIds)
        : { data: [] };
      const totalBudget = ((rawBudgets ?? []) as { revised_budget: number }[]).reduce((s, b) => s + Number(b.revised_budget), 0);

      const { data: rawContracts } = await db.from("contracts").select("original_value, approved_co_amount").eq("project_id", projectId).neq("status", "terminated");
      const totalCommitted = ((rawContracts ?? []) as { original_value: number; approved_co_amount: number | null }[]).reduce(
        (s, c) => s + Number(c.original_value) + Number(c.approved_co_amount ?? 0), 0
      );

      const { data: rawPendingCOs } = await db.from("change_orders").select("amount").eq("project_id", projectId).eq("status", "proposed");
      const pendingCOs = (rawPendingCOs ?? []) as { amount: number }[];
      const pendingCOValue = pendingCOs.reduce((s, co) => s + Number(co.amount), 0);

      let totalPaid = 0, totalUnpaid = 0;
      if (project.appfolio_property_id) {
        const { data: rawTx } = await db.from("appfolio_transactions").select("paid_amount, unpaid_amount").eq("appfolio_property_id", project.appfolio_property_id);
        for (const t of (rawTx ?? []) as { paid_amount: number; unpaid_amount: number }[]) {
          totalPaid += Number(t.paid_amount);
          totalUnpaid += Number(t.unpaid_amount);
        }
      }

      return {
        project: { id: project.id, name: project.name, code: project.code, status: project.status },
        total_budget: totalBudget,
        total_committed: totalCommitted,
        pending_co_value: pendingCOValue,
        pending_co_count: pendingCOs.length,
        total_paid: totalPaid,
        total_unpaid: totalUnpaid,
        total_incurred: totalPaid + totalUnpaid,
        uncommitted: totalBudget - totalCommitted,
        balance_to_complete: totalBudget - (totalPaid + totalUnpaid),
      };
    }

    // ── summarize_spend ────────────────────────────────────────────────────
    case "summarize_spend": {
      const projectId = input.project_id as string | undefined;
      const costCategory = input.cost_category as string | undefined;
      const vendorName = input.vendor_name as string | undefined;
      const dateFrom = input.date_from as string | undefined;
      const dateTo = input.date_to as string | undefined;
      const groupBy = (input.group_by as string) ?? "none";

      const propIds = await getScopedPropertyIds(projectId);
      if (propIds === null && projectId) return { error: "Access denied" };

      let q = db.from("appfolio_transactions").select(
        "appfolio_property_id, cost_category_code, cost_category_name, vendor_name, paid_amount, unpaid_amount, bill_date"
      );

      if (propIds !== null) q = q.in("appfolio_property_id", propIds);
      if (costCategory) {
        q = q.or(`cost_category_name.ilike.%${costCategory}%,cost_category_code.ilike.%${costCategory}%`);
      }
      if (vendorName) q = q.ilike("vendor_name", `%${vendorName}%`);
      if (dateFrom) q = q.gte("bill_date", dateFrom);
      if (dateTo) q = q.lte("bill_date", dateTo);

      const { data: rawTx } = await q;
      const txs = (rawTx ?? []) as {
        appfolio_property_id: string;
        cost_category_code: string | null;
        cost_category_name: string | null;
        vendor_name: string;
        paid_amount: number;
        unpaid_amount: number;
        bill_date: string;
      }[];

      if (txs.length === 0) {
        return { total_paid: 0, total_unpaid: 0, total_incurred: 0, count: 0, groups: [] };
      }

      // Build project lookup for grouping
      const allPropIds = [...new Set(txs.map((t) => t.appfolio_property_id))];
      const { data: rawProjMap } = await db.from("projects").select("appfolio_property_id, name, code").in("appfolio_property_id", allPropIds);
      const propToProject = new Map(((rawProjMap ?? []) as { appfolio_property_id: string; name: string; code: string }[]).map((p) => [p.appfolio_property_id, `${p.name} (${p.code})`]));

      const totalPaid = txs.reduce((s, t) => s + Number(t.paid_amount), 0);
      const totalUnpaid = txs.reduce((s, t) => s + Number(t.unpaid_amount), 0);

      if (groupBy === "none") {
        return { total_paid: totalPaid, total_unpaid: totalUnpaid, total_incurred: totalPaid + totalUnpaid, transaction_count: txs.length };
      }

      // Group aggregation
      const groupMap = new Map<string, { paid: number; unpaid: number; count: number }>();
      for (const t of txs) {
        let key = "";
        if (groupBy === "cost_category") key = t.cost_category_name ? `${t.cost_category_code} ${t.cost_category_name}` : (t.cost_category_code ?? "Unmatched");
        else if (groupBy === "vendor") key = t.vendor_name;
        else if (groupBy === "project") key = propToProject.get(t.appfolio_property_id) ?? t.appfolio_property_id;
        const existing = groupMap.get(key) ?? { paid: 0, unpaid: 0, count: 0 };
        groupMap.set(key, { paid: existing.paid + Number(t.paid_amount), unpaid: existing.unpaid + Number(t.unpaid_amount), count: existing.count + 1 });
      }

      const groups = [...groupMap.entries()]
        .map(([key, v]) => ({ group: key, paid: v.paid, unpaid: v.unpaid, total: v.paid + v.unpaid, count: v.count }))
        .sort((a, b) => b.total - a.total);

      return { total_paid: totalPaid, total_unpaid: totalUnpaid, total_incurred: totalPaid + totalUnpaid, transaction_count: txs.length, groups };
    }

    // ── query_transactions ─────────────────────────────────────────────────
    case "query_transactions": {
      const projectId = input.project_id as string | undefined;
      const costCategory = input.cost_category as string | undefined;
      const vendorName = input.vendor_name as string | undefined;
      const paymentStatus = (input.payment_status as string) ?? "all";
      const dateFrom = input.date_from as string | undefined;
      const dateTo = input.date_to as string | undefined;

      const propIds = await getScopedPropertyIds(projectId);
      if (propIds === null && projectId) return { error: "Access denied" };

      let q = db
        .from("appfolio_transactions")
        .select("id, bill_date, vendor_name, cost_category_code, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description")
        .order("bill_date", { ascending: false })
        .limit(30);

      if (propIds !== null) q = q.in("appfolio_property_id", propIds);
      if (costCategory) q = q.or(`cost_category_name.ilike.%${costCategory}%,cost_category_code.ilike.%${costCategory}%`);
      if (vendorName) q = q.ilike("vendor_name", `%${vendorName}%`);
      if (paymentStatus === "paid") q = q.gt("paid_amount", 0);
      if (paymentStatus === "unpaid") q = q.gt("unpaid_amount", 0);
      if (dateFrom) q = q.gte("bill_date", dateFrom);
      if (dateTo) q = q.lte("bill_date", dateTo);

      const { data: rawTxs } = await q;
      const txs = (rawTxs ?? []) as {
        bill_date: string; vendor_name: string; cost_category_code: string | null; cost_category_name: string | null;
        paid_amount: number; unpaid_amount: number; payment_status: string;
        appfolio_property_id: string; description: string | null;
      }[];

      const allPropIds = [...new Set(txs.map((t) => t.appfolio_property_id))];
      const { data: rawProjMap } = allPropIds.length
        ? await db.from("projects").select("appfolio_property_id, name, code").in("appfolio_property_id", allPropIds)
        : { data: [] };
      const propToProject = new Map(((rawProjMap ?? []) as { appfolio_property_id: string; name: string; code: string }[]).map((p) => [p.appfolio_property_id, `${p.name} (${p.code})`]));

      return {
        count: txs.length,
        transactions: txs.map((t) => ({
          date: t.bill_date,
          vendor: t.vendor_name,
          category: t.cost_category_name ?? t.cost_category_code ?? "Unmatched",
          paid: Number(t.paid_amount),
          unpaid: Number(t.unpaid_amount),
          status: t.payment_status,
          project: propToProject.get(t.appfolio_property_id) ?? t.appfolio_property_id,
          description: t.description,
        })),
      };
    }

    // ── get_change_orders ──────────────────────────────────────────────────
    case "get_change_orders": {
      const projectId = input.project_id as string | undefined;
      const status = (input.status as string) ?? "all";

      let q = db.from("change_orders").select("id, project_id, co_number, description, amount, status, proposed_date, rejection_reason").order("proposed_date", { ascending: false }).limit(30);
      if (projectId) {
        if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };
        q = q.eq("project_id", projectId);
      } else if (!isAdmin) {
        q = q.in("project_id", accessibleProjectIds);
      }
      if (status !== "all") q = q.eq("status", status);

      const { data: rawCos } = await q;
      const cos = (rawCos ?? []) as { co_number: string; project_id: string; description: string; amount: number; status: string; proposed_date: string; rejection_reason: string | null }[];

      const pids = [...new Set(cos.map((c) => c.project_id))];
      const { data: rawProjs } = pids.length ? await db.from("projects").select("id, name, code").in("id", pids) : { data: [] };
      const pidToName = new Map(((rawProjs ?? []) as { id: string; name: string; code: string }[]).map((p) => [p.id, `${p.name} (${p.code})`]));

      const totalProposed = cos.filter((c) => c.status === "proposed").reduce((s, c) => s + Number(c.amount), 0);

      return {
        count: cos.length,
        total_proposed_value: totalProposed,
        change_orders: cos.map((c) => ({
          co_number: c.co_number,
          project: pidToName.get(c.project_id),
          description: c.description,
          amount: Number(c.amount),
          status: c.status,
          date: c.proposed_date,
          rejection_reason: c.rejection_reason,
        })),
      };
    }

    // ── get_gates ──────────────────────────────────────────────────────────
    case "get_gates": {
      const projectId = input.project_id as string;
      if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };

      const { data: project } = await db.from("projects").select("id, name, code").eq("id", projectId).single();
      if (!project) return { error: "Project not found" };

      const { data: rawGates } = await db
        .from("gates")
        .select("id, name, sequence_number, status, start_date, end_date, notes, closed_at")
        .eq("project_id", projectId)
        .order("sequence_number");

      type GateRecord = { id: string; name: string; sequence_number: number; status: string; start_date: string | null; end_date: string | null; notes: string | null; closed_at: string | null };
      const gates = (rawGates ?? []) as GateRecord[];
      if (!gates.length) return { project: { name: (project as { name: string }).name, code: (project as { code: string }).code }, gates: [], message: "No gates defined for this project." };

      // Fetch budget totals per gate
      const gateIds = gates.map((g) => g.id);
      const { data: rawBudgets } = gateIds.length
        ? await db.from("gate_budgets").select("gate_id, original_budget, approved_co_amount").in("gate_id", gateIds)
        : { data: [] };
      const budgetByGate = new Map<string, { original: number; revised: number }>();
      for (const b of (rawBudgets ?? []) as { gate_id: string; original_budget: number; approved_co_amount: number }[]) {
        const prev = budgetByGate.get(b.gate_id) ?? { original: 0, revised: 0 };
        budgetByGate.set(b.gate_id, {
          original: prev.original + Number(b.original_budget),
          revised: prev.revised + Number(b.original_budget) + Number(b.approved_co_amount),
        });
      }

      const activeGate = gates.find((g) => g.status === "active");
      const closedGates = gates.filter((g) => g.status === "closed");
      const pendingGates = gates.filter((g) => g.status === "pending");

      return {
        project: { name: (project as { name: string }).name, code: (project as { code: string }).code },
        summary: {
          total_gates: gates.length,
          active_gate: activeGate ? `Gate ${activeGate.sequence_number} — ${activeGate.name}` : null,
          closed_count: closedGates.length,
          pending_count: pendingGates.length,
        },
        gates: gates.map((g) => ({
          sequence_number: g.sequence_number,
          name: g.name,
          status: g.status,
          is_current: g.status === "active",
          start_date: g.start_date,
          end_date: g.end_date,
          closed_at: g.closed_at,
          notes: g.notes,
          original_budget: budgetByGate.get(g.id)?.original ?? 0,
          revised_budget: budgetByGate.get(g.id)?.revised ?? 0,
        })),
      };
    }

    // ── get_contracts ──────────────────────────────────────────────────────
    case "get_contracts": {
      const projectId = input.project_id as string;
      const status = (input.status as string) ?? "all";
      if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };

      let q = db.from("contracts").select("id, vendor_name, contract_number, original_value, approved_co_amount, status, execution_date").eq("project_id", projectId).order("vendor_name");
      if (status !== "all") q = q.eq("status", status);

      const { data: rawContracts } = await q;
      const contracts = (rawContracts ?? []) as { vendor_name: string; contract_number: string | null; original_value: number; approved_co_amount: number | null; status: string; execution_date: string | null }[];
      const total = contracts.reduce((s, c) => s + Number(c.original_value) + Number(c.approved_co_amount ?? 0), 0);

      return {
        count: contracts.length,
        total_committed: total,
        contracts: contracts.map((c) => ({
          vendor: c.vendor_name,
          contract_number: c.contract_number,
          original_value: Number(c.original_value),
          approved_cos: Number(c.approved_co_amount ?? 0),
          current_value: Number(c.original_value) + Number(c.approved_co_amount ?? 0),
          status: c.status,
          execution_date: c.execution_date,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-clerk-user-id");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { messages } = await req.json();
  const trimmed = (messages as Anthropic.MessageParam[]).slice(-20);

  const db = createAdminClient();
  const { data: user } = await db.from("users").select("role").eq("id", userId).single();
  const isAdmin = user?.role === "admin" || user?.role === "accounting" || user?.role === "development_lead";

  let accessibleProjectIds: string[] = [];
  if (!isAdmin) {
    const { data: pu } = await db.from("project_users").select("project_id").eq("user_id", userId);
    accessibleProjectIds = ((pu ?? []) as { project_id: string }[]).map((r) => r.project_id);
  }

  const systemPrompt = buildSystemPrompt();

  // Agentic loop — run tool calls until end_turn
  let loopMessages = [...trimmed];
  let finalText = "";

  // Accumulate token usage across all loop iterations
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  const MODEL = "claude-sonnet-4-6";

  for (let i = 0; i < 8; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages: loopMessages,
    });

    // Accumulate usage
    totalInputTokens += response.usage?.input_tokens ?? 0;
    totalOutputTokens += response.usage?.output_tokens ?? 0;
    totalCacheReadTokens += (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0;
    totalCacheWriteTokens += (response.usage as unknown as Record<string, number>)?.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === "end_turn") {
      finalText = (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)?.text ?? "";
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input as Record<string, unknown>, accessibleProjectIds, isAdmin);
          return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify(result) };
        })
      );

      loopMessages.push({ role: "user", content: toolResults });
    } else {
      finalText = (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)?.text ?? "";
      break;
    }
  }

  // Pricing for claude-sonnet-4-6 (per million tokens)
  const INPUT_COST_PER_M = 3.0;
  const OUTPUT_COST_PER_M = 15.0;
  const CACHE_READ_COST_PER_M = 0.3;
  const CACHE_WRITE_COST_PER_M = 3.75;
  const costUsd =
    (totalInputTokens * INPUT_COST_PER_M +
      totalOutputTokens * OUTPUT_COST_PER_M +
      totalCacheReadTokens * CACHE_READ_COST_PER_M +
      totalCacheWriteTokens * CACHE_WRITE_COST_PER_M) /
    1_000_000;

  // Await logging so inserts complete before the serverless function is torn down.
  // Failure must never break the response — catch both individually.
  const logDb = createAdminClient();
  await Promise.allSettled([
    logDb.from("ai_usage_logs").insert({
      user_id: userId,
      model: MODEL,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_read_tokens: totalCacheReadTokens,
      cache_write_tokens: totalCacheWriteTokens,
      cost_usd: costUsd,
    }),
    logDb.from("chat_logs").insert({
      user_id: userId,
      messages: trimmed,
      response: finalText,
    }),
  ]);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(finalText));
      controller.close();
    },
  });

  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a helpful assistant for Steiner Developers' construction cost tracking application. You have direct access to the live database and should use your tools to answer questions with real data whenever possible.

The application tracks:
- Projects: construction projects with name, code, status, linked to AppFolio properties
- Gates: project phases with revised budgets per cost category
- Change Orders: proposed/approved/rejected cost changes on contracts or gates
- AppFolio Transactions: bills and payments (paid_amount, unpaid_amount, payment_status, vendor_name)
- Contracts: committed costs with vendors, original_value, approved_co_amount
- Cost Categories: codes that categorize spend

Available reports: /reports/cost-management, /reports/cost-detail, /reports/vendor-detail, /reports/commitment-detail, /reports/change-orders, /reports/balance-sheet

Be concise. Always use tools to get real data before answering financial questions. Format dollar amounts with commas. When referencing a page, include its path.`;

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
    name: "query_transactions",
    description:
      "Query AppFolio transactions with optional filters. Returns up to 25 rows sorted by bill_date descending.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "Filter to one project by project UUID",
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
        days: {
          type: "number",
          description: "Limit to transactions in the last N days",
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

  // Helper: apply project scope filter
  function inProjects(id: string) {
    return isAdmin ? true : accessibleProjectIds.includes(id);
  }

  switch (name) {
    case "list_projects": {
      const statusFilter = (input.status as string) ?? "active";

      let q = db.from("projects").select("id, name, code, status, appfolio_property_id").order("name");
      if (statusFilter === "active") q = q.eq("status", "active");
      if (!isAdmin) q = q.in("id", accessibleProjectIds);

      const { data: projects } = await q;
      if (!projects?.length) return { projects: [] };

      // Get budgets per project
      const projectIds = projects.map((p) => p.id);
      const { data: gates } = await db
        .from("gates")
        .select("id, project_id")
        .in("project_id", projectIds);

      const gateIds = (gates ?? []).map((g) => g.id);
      const { data: budgets } = gateIds.length
        ? await db.from("gate_budgets").select("gate_id, revised_budget").in("gate_id", gateIds)
        : { data: [] };

      const gateToProject = new Map((gates ?? []).map((g) => [g.id, g.project_id]));
      const budgetByProject = new Map<string, number>();
      for (const b of budgets ?? []) {
        const pid = gateToProject.get(b.gate_id);
        if (pid) budgetByProject.set(pid, (budgetByProject.get(pid) ?? 0) + Number(b.revised_budget));
      }

      // Get spend per project via appfolio_property_id
      const propIds = projects.filter((p) => p.appfolio_property_id).map((p) => p.appfolio_property_id);
      const { data: txSums } = propIds.length
        ? await db
            .from("appfolio_transactions")
            .select("appfolio_property_id, paid_amount, unpaid_amount")
            .in("appfolio_property_id", propIds)
        : { data: [] };

      const spendByProp = new Map<string, number>();
      for (const t of txSums ?? []) {
        spendByProp.set(
          t.appfolio_property_id,
          (spendByProp.get(t.appfolio_property_id) ?? 0) + Number(t.paid_amount) + Number(t.unpaid_amount)
        );
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

    case "get_project_financials": {
      const projectId = input.project_id as string;
      if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };

      const { data: project } = await db
        .from("projects")
        .select("id, name, code, status, appfolio_property_id")
        .eq("id", projectId)
        .single();

      if (!project) return { error: "Project not found" };

      // Budget
      const { data: gates } = await db.from("gates").select("id").eq("project_id", projectId);
      const gateIds = (gates ?? []).map((g) => g.id);
      const { data: budgets } = gateIds.length
        ? await db.from("gate_budgets").select("revised_budget").in("gate_id", gateIds)
        : { data: [] };
      const totalBudget = (budgets ?? []).reduce((s, b) => s + Number(b.revised_budget), 0);

      // Committed (contracts)
      const { data: contracts } = await db
        .from("contracts")
        .select("original_value, approved_co_amount, status")
        .eq("project_id", projectId)
        .neq("status", "terminated");
      const totalCommitted = (contracts ?? []).reduce(
        (s, c) => s + Number(c.original_value) + Number(c.approved_co_amount ?? 0),
        0
      );

      // Pending COs
      const { data: pendingCOs } = await db
        .from("change_orders")
        .select("amount")
        .eq("project_id", projectId)
        .eq("status", "proposed");
      const pendingCOValue = (pendingCOs ?? []).reduce((s, co) => s + Number(co.amount), 0);

      // Incurred (transactions)
      let totalPaid = 0;
      let totalUnpaid = 0;
      if (project.appfolio_property_id) {
        const { data: txTotals } = await db
          .from("appfolio_transactions")
          .select("paid_amount, unpaid_amount")
          .eq("appfolio_property_id", project.appfolio_property_id);
        totalPaid = (txTotals ?? []).reduce((s, t) => s + Number(t.paid_amount), 0);
        totalUnpaid = (txTotals ?? []).reduce((s, t) => s + Number(t.unpaid_amount), 0);
      }

      return {
        project: { id: project.id, name: project.name, code: project.code, status: project.status },
        total_budget: totalBudget,
        total_committed: totalCommitted,
        pending_co_value: pendingCOValue,
        pending_co_count: pendingCOs?.length ?? 0,
        total_paid: totalPaid,
        total_unpaid: totalUnpaid,
        total_incurred: totalPaid + totalUnpaid,
        uncommitted: totalBudget - totalCommitted,
        balance_to_complete: totalBudget - (totalPaid + totalUnpaid),
      };
    }

    case "query_transactions": {
      const projectId = input.project_id as string | undefined;
      const vendorName = input.vendor_name as string | undefined;
      const paymentStatus = (input.payment_status as string) ?? "all";
      const days = input.days as number | undefined;

      // Resolve appfolio_property_id
      let propIds: string[] | null = null;
      if (projectId) {
        if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };
        const { data: proj } = await db
          .from("projects")
          .select("appfolio_property_id")
          .eq("id", projectId)
          .single();
        if (proj?.appfolio_property_id) propIds = [proj.appfolio_property_id];
      } else if (!isAdmin) {
        // Scope to accessible projects' property IDs
        const { data: projs } = await db
          .from("projects")
          .select("appfolio_property_id")
          .in("id", accessibleProjectIds)
          .not("appfolio_property_id", "is", null);
        propIds = (projs ?? []).map((p) => p.appfolio_property_id).filter(Boolean);
      }

      let q = db
        .from("appfolio_transactions")
        .select(
          "id, bill_date, vendor_name, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description"
        )
        .order("bill_date", { ascending: false })
        .limit(25);

      if (propIds) q = q.in("appfolio_property_id", propIds);
      if (vendorName) q = q.ilike("vendor_name", `%${vendorName}%`);
      if (paymentStatus === "paid") q = q.gt("paid_amount", 0);
      if (paymentStatus === "unpaid") q = q.gt("unpaid_amount", 0);
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        q = q.gte("bill_date", since.toISOString().slice(0, 10));
      }

      const { data: txs } = await q;

      // Map property_id back to project name
      const allPropIds = [...new Set((txs ?? []).map((t) => t.appfolio_property_id))];
      const { data: projMap } = allPropIds.length
        ? await db
            .from("projects")
            .select("appfolio_property_id, name, code")
            .in("appfolio_property_id", allPropIds)
        : { data: [] };
      const propToProject = new Map((projMap ?? []).map((p) => [p.appfolio_property_id, `${p.name} (${p.code})`]));

      return {
        count: txs?.length ?? 0,
        transactions: (txs ?? []).map((t) => ({
          date: t.bill_date,
          vendor: t.vendor_name,
          category: t.cost_category_name,
          paid: Number(t.paid_amount),
          unpaid: Number(t.unpaid_amount),
          status: t.payment_status,
          project: propToProject.get(t.appfolio_property_id) ?? t.appfolio_property_id,
          description: t.description,
        })),
      };
    }

    case "get_change_orders": {
      const projectId = input.project_id as string | undefined;
      const status = (input.status as string) ?? "all";

      let q = db
        .from("change_orders")
        .select("id, project_id, co_number, description, amount, status, proposed_date, rejection_reason")
        .order("proposed_date", { ascending: false })
        .limit(30);

      if (projectId) {
        if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };
        q = q.eq("project_id", projectId);
      } else if (!isAdmin) {
        q = q.in("project_id", accessibleProjectIds);
      }

      if (status !== "all") q = q.eq("status", status);

      const { data: cos } = await q;

      // Get project names
      const pids = [...new Set((cos ?? []).map((c) => c.project_id))];
      const { data: projs } = pids.length
        ? await db.from("projects").select("id, name, code").in("id", pids)
        : { data: [] };
      const pidToName = new Map((projs ?? []).map((p) => [p.id, `${p.name} (${p.code})`]));

      const totalProposed = (cos ?? [])
        .filter((c) => c.status === "proposed")
        .reduce((s, c) => s + Number(c.amount), 0);

      return {
        count: cos?.length ?? 0,
        total_proposed_value: totalProposed,
        change_orders: (cos ?? []).map((c) => ({
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

    case "get_contracts": {
      const projectId = input.project_id as string;
      const status = (input.status as string) ?? "all";

      if (!isAdmin && !inProjects(projectId)) return { error: "Access denied" };

      let q = db
        .from("contracts")
        .select("id, vendor_name, contract_number, original_value, approved_co_amount, status, execution_date")
        .eq("project_id", projectId)
        .order("vendor_name");

      if (status !== "all") q = q.eq("status", status);

      const { data: contracts } = await q;

      const total = (contracts ?? []).reduce(
        (s, c) => s + Number(c.original_value) + Number(c.approved_co_amount ?? 0),
        0
      );

      return {
        count: contracts?.length ?? 0,
        total_committed: total,
        contracts: (contracts ?? []).map((c) => ({
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

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = await req.json();
  const trimmed = (messages as Anthropic.MessageParam[]).slice(-20);

  // Determine user role and accessible project IDs
  const db = createAdminClient();
  const { data: user } = await db
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = user?.role === "admin";
  let accessibleProjectIds: string[] = [];

  if (!isAdmin) {
    const { data: pu } = await db
      .from("project_users")
      .select("project_id")
      .eq("user_id", userId);
    accessibleProjectIds = (pu ?? []).map((r) => r.project_id);
  }

  // Agentic loop — run tool calls until end_turn
  let loopMessages = [...trimmed];
  let finalText = "";

  for (let i = 0; i < 6; i++) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      messages: loopMessages,
    });

    if (response.stop_reason === "end_turn") {
      finalText =
        (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)
          ?.text ?? "";
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            accessibleProjectIds,
            isAdmin
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      loopMessages.push({ role: "user", content: toolResults });
    } else {
      // Unexpected stop reason — extract any text and bail
      finalText =
        (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)
          ?.text ?? "";
      break;
    }
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(finalText));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

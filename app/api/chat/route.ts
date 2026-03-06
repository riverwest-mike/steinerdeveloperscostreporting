import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic();

// Cached system prompt — describes the app's data model and navigation.
// cache_control marks this for prompt caching so it isn't re-billed on every turn.
const SYSTEM_PROMPT = `You are a helpful assistant for Steiner Developers' construction cost tracking application.

The application tracks:
- Projects: construction projects with name, code, status (active/inactive), linked to AppFolio properties
- Gates: project phases/milestones, each with a revised_budget (gate_budgets table)
- Change Orders: proposed or approved cost changes per project with amounts and dates
- AppFolio Transactions: bills and payments with vendor names, cost categories, paid_amount, unpaid_amount, payment_status
- Contracts: committed costs with vendors, linked to gates and cost categories via contract_line_items (Schedule of Values)
- Cost Categories: codes that categorize spend (e.g., civil, structural, MEP)

Available reports and their URLs:
- /reports/cost-management — Project Cost Management (PCM): budget vs actual vs committed by cost code
- /reports/cost-detail — Cost Detail: transaction-level detail with filters
- /reports/vendor-detail — Vendor Detail: spend grouped by vendor
- /reports/commitment-detail — Commitment Detail: contracts and line items
- /reports/change-orders — Change Order Log: all change orders by project
- /reports/balance-sheet — Balance Sheet: AppFolio balance sheet data
- /projects — All projects list
- /dashboard — Overview with KPIs

Be concise. For specific dollar amounts or live data, direct the user to the relevant report. When referencing a page, include its path so they can navigate directly.`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Limit history to last 20 messages to control token spend
  const trimmed = (messages as Anthropic.MessageParam[]).slice(-20);

  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // @ts-expect-error cache_control is valid at runtime
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: trimmed,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

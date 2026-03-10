import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ drawId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { drawId } = await params;
  const supabase = createAdminClient();

  const [
    { data: draw },
    { data: lines },
    { data: categories },
    { data: previousDraws },
  ] = await Promise.all([
    supabase
      .from("draw_requests")
      .select("id, draw_number, title, submission_date, status, lender, project_id, notes")
      .eq("id", drawId)
      .single(),
    supabase
      .from("draw_request_lines")
      .select("cost_category_id, this_draw_amount")
      .eq("draw_request_id", drawId),
    supabase
      .from("cost_categories")
      .select("id, name, code, display_order")
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("draw_requests")
      .select("id, status, draw_request_lines(cost_category_id, this_draw_amount)")
      .order("draw_number"),
  ]);

  if (!draw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("name, code")
    .eq("id", draw.project_id)
    .single();

  // Build budget totals per category across all gates
  const { data: gateBudgets } = await supabase
    .from("gate_budgets")
    .select("cost_category_id, revised_budget, gates!inner(project_id)")
    .eq("gates.project_id", draw.project_id);

  interface GateBudgetRaw {
    cost_category_id: string;
    revised_budget: number;
  }

  const budgetByCategory = new Map<string, number>();
  for (const row of (gateBudgets ?? []) as GateBudgetRaw[]) {
    budgetByCategory.set(
      row.cost_category_id,
      (budgetByCategory.get(row.cost_category_id) ?? 0) + (row.revised_budget ?? 0)
    );
  }

  // Previously drawn per category (all draws for the same project, excluding this draw)
  interface PrevDrawRaw {
    id: string;
    status: string;
    draw_request_lines: { cost_category_id: string; this_draw_amount: number }[];
  }

  // Filter to draws for this project
  const { data: allProjectDraws } = await supabase
    .from("draw_requests")
    .select("id, status, draw_request_lines(cost_category_id, this_draw_amount)")
    .eq("project_id", draw.project_id)
    .order("draw_number");

  void previousDraws; // unused in favour of allProjectDraws above

  const prevDrawnMap = new Map<string, number>();
  for (const pd of (allProjectDraws ?? []) as PrevDrawRaw[]) {
    if (pd.id === drawId) continue;
    for (const pl of pd.draw_request_lines ?? []) {
      prevDrawnMap.set(pl.cost_category_id, (prevDrawnMap.get(pl.cost_category_id) ?? 0) + pl.this_draw_amount);
    }
  }

  const lineMap = new Map<string, number>(
    (lines ?? []).map((l: { cost_category_id: string; this_draw_amount: number }) => [
      l.cost_category_id,
      l.this_draw_amount,
    ])
  );

  interface Category {
    id: string;
    name: string;
    code: string;
    display_order: number;
  }

  const sortedCats = ([...(categories ?? [])] as Category[]).sort((a, b) => a.display_order - b.display_order);

  const dateLabel = new Date(draw.submission_date + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build spreadsheet data
  const aoa: (string | number | null)[][] = [
    [project?.name ?? ""],
    [`Draw Request #${draw.draw_number}${draw.title ? ` — ${draw.title}` : ""}`],
    [`Submission Date: ${dateLabel}`],
    draw.lender ? [`Lender: ${draw.lender}`] : [],
    [],
    ["Code", "Cost Category", "Total Budget", "Previously Drawn", "This Draw", "Balance Remaining"],
  ];

  let totalBudget = 0;
  let totalPrevDrawn = 0;
  let totalThisDraw = 0;

  for (const cat of sortedCats) {
    const budget = budgetByCategory.get(cat.id) ?? 0;
    const prevDrawn = prevDrawnMap.get(cat.id) ?? 0;
    const thisDraw = lineMap.get(cat.id) ?? 0;
    const balance = budget - prevDrawn - thisDraw;

    if (budget === 0 && prevDrawn === 0 && thisDraw === 0) continue;

    totalBudget += budget;
    totalPrevDrawn += prevDrawn;
    totalThisDraw += thisDraw;

    aoa.push([cat.code, cat.name, budget, prevDrawn, thisDraw, balance]);
  }

  const totalBalance = totalBudget - totalPrevDrawn - totalThisDraw;
  aoa.push(["", "TOTAL", totalBudget, totalPrevDrawn, totalThisDraw, totalBalance]);

  // Notes row
  if (draw.notes) {
    aoa.push([]);
    aoa.push([`Notes: ${draw.notes}`]);
  }

  // Build worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 10 },  // Code
    { wch: 35 },  // Category
    { wch: 16 },  // Total Budget
    { wch: 16 },  // Prev Drawn
    { wch: 16 },  // This Draw
    { wch: 18 },  // Balance
  ];

  // Format currency columns (C, D, E, F = columns 2-5) as accounting
  const currencyFmt = '"$"#,##0.00_);[Red]("$"#,##0.00)';
  const headerRow = 5; // 0-indexed row of the column headers (row 6 in sheet = index 5)
  const dataStart = headerRow + 1;
  const dataEnd = dataStart + sortedCats.filter((c) =>
    (budgetByCategory.get(c.id) ?? 0) !== 0 ||
    (prevDrawnMap.get(c.id) ?? 0) !== 0 ||
    (lineMap.get(c.id) ?? 0) !== 0
  ).length;

  for (let r = dataStart; r <= dataEnd + 1; r++) {
    for (const col of [2, 3, 4, 5]) {
      const cellRef = XLSX.utils.encode_cell({ r, c: col });
      if (ws[cellRef]) {
        ws[cellRef].z = currencyFmt;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Draw Request");

  const filename = `Draw-${draw.draw_number}${draw.title ? `-${draw.title.replace(/[^a-zA-Z0-9]/g, "-")}` : ""}.xlsx`;

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

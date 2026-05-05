import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

const FIXED_FIELDS = ["Gate Name", "Sequence", "Start Date", "End Date", "Notes"];
const SAMPLE_GATE_COLUMNS = 4;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: projectId } = await params;
  const supabase = createAdminClient();

  const { data: categories } = await supabase
    .from("cost_categories")
    .select("code, name")
    .eq("is_active", true)
    .order("display_order");

  const { data: project } = await supabase
    .from("projects")
    .select("name, code")
    .eq("id", projectId)
    .single();

  const cats = (categories ?? []) as { code: string; name: string }[];

  // ── Vertical (transposed) template ─────────────────────────────────────
  // Column A: field labels
  // Column B+: one column per gate
  const columnHeaders = ["Field", ...Array.from({ length: SAMPLE_GATE_COLUMNS }, (_, i) => `Gate ${i + 1}`)];

  const example = ["Phase 1 - Acquisition", "1", "2025-01-01", "2025-06-30", "Example gate"];

  const rows: (string | number)[][] = [columnHeaders];
  FIXED_FIELDS.forEach((label, i) => {
    rows.push([label, example[i] ?? "", ...Array(SAMPLE_GATE_COLUMNS - 1).fill("")]);
  });
  for (const cat of cats) {
    rows.push([`${cat.code} - ${cat.name}`, 0, ...Array(SAMPLE_GATE_COLUMNS - 1).fill("")]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths: wide first column for field labels
  ws["!cols"] = [
    { wch: 36 },
    ...Array(SAMPLE_GATE_COLUMNS).fill({ wch: 22 }),
  ];

  // Freeze the field-label column (A) and the header row
  (ws as XLSX.WorkSheet & { "!views"?: unknown[] })["!views"] = [
    { state: "frozen", xSplit: 1, ySplit: 1, topLeftCell: "B2", activePane: "bottomRight" },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gates");

  // ── Instructions sheet ─────────────────────────────────────────────────
  const noteData: (string | number)[][] = [
    ["Format", "Vertical (transposed) — fields run down column A; one gate per column starting at B"],
    [],
    ["Field", "Required?", "Format / Notes"],
    ["Gate Name", "Yes", "Name of the gate / phase"],
    ["Sequence", "No", "Numeric order; if blank, columns are numbered 1, 2, 3…"],
    ["Start Date", "No", "YYYY-MM-DD or MM/DD/YYYY"],
    ["End Date", "No", "YYYY-MM-DD or MM/DD/YYYY"],
    ["Notes", "No", "Free text"],
    [],
    ["Cost Categories", "No", `Each row below "Notes" represents one cost category. Format is "<code> - <name>". Enter the budget amount in the same column as the gate.`],
    ...cats.map((c) => [`${c.code} - ${c.name}`, "No", `Budget amount for "${c.name}"`]),
  ];
  const notesWs = XLSX.utils.aoa_to_sheet(noteData);
  notesWs["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, notesWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `gates-template-${project?.code ?? projectId}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

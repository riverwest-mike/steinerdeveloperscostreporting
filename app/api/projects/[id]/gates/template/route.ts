import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  const categoryCodes = (categories ?? []).map((c: { code: string; name: string }) => c.code);

  // Build header row
  const headers = ["Gate Name", "Sequence", "Start Date", "End Date", "Notes", ...categoryCodes];

  // Build example row
  const exampleBudgets = categoryCodes.map(() => 0);
  const example = ["Phase 1 - Acquisition", 1, "2025-01-01", "2025-06-30", "Example gate", ...exampleBudgets];

  // Build worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  // Column widths
  ws["!cols"] = [
    { wch: 30 }, // Gate Name
    { wch: 10 }, // Sequence
    { wch: 14 }, // Start Date
    { wch: 14 }, // End Date
    { wch: 30 }, // Notes
    ...categoryCodes.map(() => ({ wch: 14 })),
  ];

  // Header row style hint via named range
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gates");

  // Add a note sheet explaining the format
  const noteData = [
    ["Column", "Required?", "Format / Notes"],
    ["Gate Name", "Yes", "Name of the gate / phase"],
    ["Sequence", "No", "Numeric order; if blank, rows are numbered 1, 2, 3…"],
    ["Start Date", "No", "YYYY-MM-DD or MM/DD/YYYY"],
    ["End Date", "No", "YYYY-MM-DD or MM/DD/YYYY"],
    ["Notes", "No", "Free text"],
    ...categoryCodes.map((code: string) => {
      const cat = (categories ?? []).find((c: { code: string; name: string }) => c.code === code);
      return [code, "No", `Budget amount for "${cat?.name ?? code}"`];
    }),
  ];
  const notesWs = XLSX.utils.aoa_to_sheet(noteData);
  notesWs["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 40 }];
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

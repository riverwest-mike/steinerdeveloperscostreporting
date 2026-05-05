"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";
import type { CommitmentRow } from "./page";

function ExcelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#1D6F42" />
      <path
        d="M7 7.5L12 12L17 7.5M7 16.5L12 12L17 16.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface ExportButtonsProps {
  rows: CommitmentRow[];
  projectLabel: string;
  categoryLabel: string;
  statusLabel: string;
  asOf: string;
  showProjectCol: boolean;
}

export function ExportButtons({ rows, projectLabel, categoryLabel, statusLabel, asOf, showProjectCol }: ExportButtonsProps) {
  const handleExcelExport = useCallback(async () => {
    const XLSX = await import("xlsx");

    const dateLabel = new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const headers: string[] = [];
    if (showProjectCol) headers.push("Project Code", "Project Name");
    headers.push(
      "Vendor", "Contract #", "Contract Description",
      "Cost Category Code", "Cost Category Name",
      "Gate(s)", "Execution Date", "Status",
      "Base Amount", "Approved COs", "Total Committed", "Retainage %"
    );

    const data: (string | number)[][] = [
      [`Commitment Detail Report — ${projectLabel}`],
      [`Cost Category: ${categoryLabel}  |  ${statusLabel}  |  As of ${dateLabel}`],
      [],
      headers,
    ];

    for (const row of rows) {
      const r: (string | number)[] = [];
      if (showProjectCol) r.push(row.projectCode, row.projectName);
      r.push(
        row.vendorName,
        row.contractNumber ?? "",
        row.contractDescription,
        row.costCategoryCode,
        row.costCategoryName,
        row.gates,
        row.executionDate ?? "",
        row.status,
        Number(row.baseAmount),
        Number(row.approvedCOs),
        Number(row.totalCommitted),
        row.retainagePct > 0 ? row.retainagePct : "",
      );
      data.push(r);
    }

    const totalBase = rows.reduce((s, r) => s + r.baseAmount, 0);
    const totalCOs = rows.reduce((s, r) => s + r.approvedCOs, 0);
    const totalCommitted = rows.reduce((s, r) => s + r.totalCommitted, 0);
    const blankCols = showProjectCol ? 9 : 7;
    data.push([]);
    data.push([
      `TOTAL — ${rows.length} line${rows.length !== 1 ? "s" : ""}`,
      ...Array(blankCols - 1).fill(""),
      totalBase,
      totalCOs,
      totalCommitted,
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const colWidths = showProjectCol
      ? [{ wch: 12 }, { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]
      : [{ wch: 28 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    ws["!cols"] = colWidths;

    const headerColCount = headers.length;
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headerColCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headerColCount - 1 } },
    ];

    // Currency cols: Base Amount, Approved COs, Total Committed
    const baseCol = showProjectCol ? 9 : 7;
    const { CURRENCY_FMT, freezeHeader, setColumnFormats } = await import("@/lib/xlsx-helpers");
    setColumnFormats(ws, 4, data.length - 1, [baseCol, baseCol + 1, baseCol + 2], CURRENCY_FMT);
    freezeHeader(ws, 4);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Commitment Detail");
    const safeLabel = categoryLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `Commitment_Detail_${safeLabel}_${asOf}.xlsx`);
  }, [rows, projectLabel, categoryLabel, statusLabel, asOf, showProjectCol]);

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={handleExcelExport}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ExcelIcon className="h-4 w-4" />
        Excel
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print / PDF
      </button>
    </div>
  );
}

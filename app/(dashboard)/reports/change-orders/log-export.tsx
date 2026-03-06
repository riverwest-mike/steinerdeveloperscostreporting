"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";
import type { COLogRow } from "./page";

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

interface Props {
  rows: COLogRow[];
  projectLabel: string;
  showProjectCol: boolean;
}

export function COLogExport({ rows, projectLabel, showProjectCol }: Props) {
  const handleExcel = useCallback(async () => {
    const XLSX = await import("xlsx");

    const headers: string[] = [];
    if (showProjectCol) headers.push("Project Code", "Project Name");
    headers.push(
      "CO #", "Status", "Type", "Gate", "Contract / Vendor",
      "Cost Category Code", "Cost Category Name",
      "Description", "Amount",
      "Proposed Date", "Approved Date", "Rejection Reason", "Notes"
    );

    const today = new Date().toISOString().split("T")[0];
    const data: (string | number)[][] = [
      [`Change Order Log — ${projectLabel}`],
      [`Generated ${today}`],
      [],
      headers,
    ];

    for (const row of rows) {
      const r: (string | number)[] = [];
      if (showProjectCol) r.push(row.projectCode, row.projectName);
      r.push(
        row.coNumber,
        row.status,
        row.isBudgetCO ? "Budget CO" : "Contract CO",
        row.gateName,
        row.contractVendor ?? "",
        row.costCategoryCode,
        row.costCategoryName,
        row.description,
        Number(row.amount),
        row.proposedDate,
        row.approvedDate ?? "",
        row.rejectionReason ?? "",
        row.notes ?? "",
      );
      data.push(r);
    }

    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const blankCols = showProjectCol ? 9 : 7;
    data.push([]);
    data.push([
      `TOTAL — ${rows.length} CO${rows.length !== 1 ? "s" : ""}`,
      ...Array(blankCols - 1).fill(""),
      totalAmount,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = showProjectCol
      ? [
          { wch: 12 }, { wch: 28 },
          { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 28 },
          { wch: 18 }, { wch: 22 }, { wch: 36 }, { wch: 14 },
          { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 36 },
        ]
      : [
          { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 28 },
          { wch: 18 }, { wch: 22 }, { wch: 36 }, { wch: 14 },
          { wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 36 },
        ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Change Order Log");
    XLSX.writeFile(wb, `Change_Order_Log_${today}.xlsx`);
  }, [rows, projectLabel, showProjectCol]);

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={handleExcel}
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

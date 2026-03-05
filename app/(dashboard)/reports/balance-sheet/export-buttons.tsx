"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";

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

interface GlRow {
  gl_account_id: string;
  gl_account_name: string;
  gl_account_number: string | null;
  account_type: string;
  balance: number;
}

interface SectionData {
  label: string;
  rows: GlRow[];
  total: number;
}

interface ExportButtonsProps {
  sections: SectionData[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  projectCode: string;
  projectName: string;
  displayDate: string;
  basis: string;
  isBalanced: boolean;
}

export function ExportButtons({
  sections, totalAssets, totalLiabilities, totalEquity,
  projectCode, projectName, displayDate, basis, isBalanced,
}: ExportButtonsProps) {
  const handleExcelExport = useCallback(async () => {
    const XLSX = await import("xlsx");

    const data: (string | number)[][] = [
      [projectName],
      ["Balance Sheet"],
      [`As of ${displayDate} · ${basis} Basis`],
      [],
      ["Account Number", "Account Name", "Balance"],
    ];

    for (const section of sections) {
      // Section header
      data.push([section.label]);
      for (const row of section.rows) {
        data.push([
          row.gl_account_number ?? "",
          row.gl_account_name,
          Number(row.balance),
        ]);
      }
      data.push(["", `Total ${section.label}`, section.total]);
      data.push([]);
    }

    data.push([]);
    data.push(["", "TOTAL ASSETS", totalAssets]);
    data.push(["", "TOTAL LIABILITIES & CAPITAL", totalLiabilities + totalEquity]);
    data.push([]);
    data.push(["", isBalanced ? "In Balance" : "OUT OF BALANCE", ""]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");

    const safeDate = displayDate.replace(/,/g, "").replace(/ /g, "_");
    XLSX.writeFile(wb, `${projectCode}_Balance_Sheet_${safeDate}.xlsx`);
  }, [sections, totalAssets, totalLiabilities, totalEquity, projectCode, projectName, displayDate, basis, isBalanced]);

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

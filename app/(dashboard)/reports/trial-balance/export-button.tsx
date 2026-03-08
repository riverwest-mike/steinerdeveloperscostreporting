"use client";

import { Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";

export interface TbRow {
  glAccountId: string;
  glAccountName: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Props {
  rows: TbRow[];
  projectLabel: string;
  dateLabel: string;
}

export function ExportButton({ rows, projectLabel, dateLabel }: Props) {
  function handleExport() {
    const sheetRows: unknown[][] = [
      [`Trial Balance — ${projectLabel}`],
      [dateLabel],
      [],
      ["GL Account", "Account Name", "Debit", "Credit", "Balance"],
    ];

    for (const r of rows) {
      sheetRows.push([r.glAccountId, r.glAccountName, r.debit, r.credit, r.balance]);
    }

    sheetRows.push([]);
    const totDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totCredit = rows.reduce((s, r) => s + r.credit, 0);
    const totBalance = rows.reduce((s, r) => s + r.balance, 0);
    sheetRows.push(["TOTAL", "", totDebit, totCredit, totBalance]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);

    // Format currency columns C-E (indices 2-4) starting at data row 5 (index 4)
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = 4; R <= range.e.r; R++) {
      for (const C of [2, 3, 4]) {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellAddr] && typeof ws[cellAddr].v === "number") {
          ws[cellAddr].z = "#,##0.00";
        }
      }
    }

    ws["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `trial-balance-${Date.now()}.xlsx`);
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={handleExport}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Download className="h-4 w-4" />
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

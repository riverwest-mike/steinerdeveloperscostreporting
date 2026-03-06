"use client";

import { Download } from "lucide-react";
import * as XLSX from "xlsx";

export interface TbRow {
  glAccountId: string;
  glAccountName: string;
  billDate: string | null;
  vendorName: string;
  description: string | null;
  referenceNumber: string | null;
  invoiceAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  projectCode: string;
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
      ["GL Account", "GL Account Name", "Date", "Vendor", "Description", "Reference", "Invoice", "Paid", "Unpaid", "Project"],
    ];

    // Group by GL account for export
    const groups = new Map<string, TbRow[]>();
    for (const r of rows) {
      const key = `${r.glAccountId}||${r.glAccountName}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    for (const [key, txns] of groups) {
      const [acctId, acctName] = key.split("||");
      const totInv = txns.reduce((s, t) => s + t.invoiceAmount, 0);
      const totPaid = txns.reduce((s, t) => s + t.paidAmount, 0);
      const totUnpaid = txns.reduce((s, t) => s + t.unpaidAmount, 0);

      // Account header row
      sheetRows.push([acctId, acctName, "", "", "", "", totInv, totPaid, totUnpaid, ""]);

      for (const t of txns) {
        sheetRows.push([
          t.glAccountId,
          t.glAccountName,
          t.billDate ?? "",
          t.vendorName,
          t.description ?? "",
          t.referenceNumber ?? "",
          t.invoiceAmount,
          t.paidAmount,
          t.unpaidAmount,
          t.projectCode,
        ]);
      }

      sheetRows.push([]); // blank spacer
    }

    // Grand total
    const gtInv = rows.reduce((s, t) => s + t.invoiceAmount, 0);
    const gtPaid = rows.reduce((s, t) => s + t.paidAmount, 0);
    const gtUnpaid = rows.reduce((s, t) => s + t.unpaidAmount, 0);
    sheetRows.push(["GRAND TOTAL", "", "", "", "", "", gtInv, gtPaid, gtUnpaid, ""]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `trial-balance-${Date.now()}.xlsx`);
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <Download className="h-4 w-4" />
      Export Excel
    </button>
  );
}

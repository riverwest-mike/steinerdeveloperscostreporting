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

interface GateTransaction {
  appfolio_property_id: string;
  vendor_name: string;
  description: string | null;
  gl_account_id: string;
  gl_account_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  bill_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  check_number: string | null;
  reference_number: string | null;
  gate_name: string;
  project_code: string;
  project_name: string;
}

interface ExportButtonsProps {
  transactions: GateTransaction[];
  reportLabel: string;
  asOf: string;
}

export function ExportButtons({ transactions, reportLabel, asOf }: ExportButtonsProps) {
  const handleExcelExport = useCallback(async () => {
    const XLSX = await import("xlsx");

    const dateLabel = new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const data: (string | number)[][] = [
      [`Gate Detail Report — ${reportLabel}`],
      [`As of ${dateLabel}`],
      [],
      [
        "Project Code", "Project Name", "Gate",
        "Bill Date", "Vendor", "Description", "GL Account", "GL Account Name",
        "Cost Category Code", "Cost Category Name",
        "Invoice Amount", "Paid", "Unpaid",
        "Status", "Check #", "Reference",
      ],
    ];

    for (const tx of transactions) {
      data.push([
        tx.project_code,
        tx.project_name,
        tx.gate_name,
        tx.bill_date ?? "",
        tx.vendor_name,
        tx.description ?? "",
        tx.gl_account_id,
        tx.gl_account_name,
        tx.cost_category_code ?? "",
        tx.cost_category_name ?? "",
        Number(tx.invoice_amount),
        Number(tx.paid_amount),
        Number(tx.unpaid_amount),
        tx.payment_status,
        tx.check_number ?? "",
        tx.reference_number ?? "",
      ]);
    }

    const totalInvoice = transactions.reduce((s, t) => s + Number(t.invoice_amount), 0);
    const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
    const totalUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);
    data.push([]);
    data.push([
      `TOTAL — ${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`,
      "", "", "", "", "", "", "", "", "",
      totalInvoice, totalPaid, totalUnpaid,
      "", "", "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 12 }, { wch: 28 }, { wch: 24 },
      { wch: 12 }, { wch: 28 }, { wch: 30 }, { wch: 12 }, { wch: 24 },
      { wch: 20 }, { wch: 24 },
      { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 14 },
    ];

    const headerColCount = 16;
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headerColCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headerColCount - 1 } },
    ];

    const { CURRENCY_FMT, freezeHeader, setColumnFormats } = await import("@/lib/xlsx-helpers");
    setColumnFormats(ws, 4, data.length - 1, [10, 11, 12], CURRENCY_FMT);
    freezeHeader(ws, 4);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gate Detail");
    const safeLabel = reportLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `Gate_Detail_${safeLabel}_${asOf}.xlsx`);
  }, [transactions, reportLabel, asOf]);

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

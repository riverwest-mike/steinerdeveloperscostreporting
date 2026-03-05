"use client";

import { useCallback } from "react";

interface ReportRow {
  id: string;
  code: string;
  name: string;
  section: string;
  a_original: number;
  b_authorized: number;
  c_current: number;
  d_proposed: number;
  e_projected: number;
  f_variance: number;
  g_committed: number;
  h_pct_committed: number | null;
  i_uncommitted: number;
  j_cost_to_date: number;
  k_balance: number;
}

interface ExportButtonsProps {
  rows: ReportRow[];
  sectionOrder: string[];
  projectName: string;
  projectCode: string;
  asOf: string;
}

const HEADERS = [
  "Code", "Category",
  "A - Original Budget", "B - Authorized Adj.", "C - Current Budget",
  "D - Proposed Adj.", "E - Projected Budget", "F - Variance",
  "G - Total Committed", "H - % Committed", "I - Uncommitted",
  "J - Cost to Date", "K - Balance to Complete",
];

function fmt(n: number): number { return Math.round(n * 100) / 100; }
function fmtPct(n: number | null): string { return n != null ? `${n.toFixed(1)}%` : ""; }

function toRowArr(r: ReportRow): (string | number)[] {
  return [
    r.code, r.name,
    fmt(r.a_original), fmt(r.b_authorized), fmt(r.c_current),
    fmt(r.d_proposed), fmt(r.e_projected), fmt(r.f_variance),
    fmt(r.g_committed), fmtPct(r.h_pct_committed), fmt(r.i_uncommitted),
    fmt(r.j_cost_to_date), fmt(r.k_balance),
  ];
}

export function ExportButtons({ rows, sectionOrder, projectName, projectCode, asOf }: ExportButtonsProps) {
  const handleExcelExport = useCallback(async () => {
    const XLSX = await import("xlsx");

    const dateLabel = new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const data: (string | number)[][] = [
      [`${projectCode} — ${projectName}`],
      [`Project Cost Management Report — As of ${dateLabel}`],
      [],
      HEADERS,
    ];

    const sectionMap = new Map<string, ReportRow[]>();
    for (const s of sectionOrder) sectionMap.set(s, []);
    for (const r of rows) sectionMap.get(r.section)?.push(r);

    const grand = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0 };

    for (const section of sectionOrder) {
      const sectionRows = (sectionMap.get(section) ?? []).filter(
        (r) => r.a_original || r.b_authorized || r.d_proposed || r.g_committed || r.j_cost_to_date
      );
      if (sectionRows.length === 0) continue;

      // Section header
      data.push([section]);

      const sub = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0 };
      for (const r of sectionRows) {
        data.push(toRowArr(r));
        sub.a += r.a_original; sub.b += r.b_authorized; sub.c += r.c_current;
        sub.d += r.d_proposed; sub.e += r.e_projected; sub.f += r.f_variance;
        sub.g += r.g_committed; sub.i += r.i_uncommitted;
        sub.j += r.j_cost_to_date; sub.k += r.k_balance;
        grand.a += r.a_original; grand.b += r.b_authorized; grand.c += r.c_current;
        grand.d += r.d_proposed; grand.e += r.e_projected; grand.f += r.f_variance;
        grand.g += r.g_committed; grand.i += r.i_uncommitted;
        grand.j += r.j_cost_to_date; grand.k += r.k_balance;
      }

      // Section subtotal
      data.push([
        "", `${section} — Subtotal`,
        fmt(sub.a), fmt(sub.b), fmt(sub.c),
        fmt(sub.d), fmt(sub.e), fmt(sub.f),
        fmt(sub.g), "", fmt(sub.i),
        fmt(sub.j), fmt(sub.k),
      ]);
      data.push([]);
    }

    // Grand total
    data.push([
      "", "GRAND TOTAL",
      fmt(grand.a), fmt(grand.b), fmt(grand.c),
      fmt(grand.d), fmt(grand.e), fmt(grand.f),
      fmt(grand.g), "", fmt(grand.i),
      fmt(grand.j), fmt(grand.k),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 36 },
      ...Array(11).fill({ wch: 20 }),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Management Report");

    const filename = `${projectCode}_Cost_Management_${asOf}.xlsx`;
    XLSX.writeFile(wb, filename);
  }, [rows, sectionOrder, projectName, projectCode, asOf]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExcelExport}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <span>⬇</span> Excel
      </button>
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors print:hidden"
      >
        <span>🖨</span> Print / PDF
      </button>
    </div>
  );
}

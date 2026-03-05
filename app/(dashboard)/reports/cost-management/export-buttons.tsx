"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";

/* ── Excel icon (Microsoft Excel green) ─────────────────── */
function ExcelIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#1D6F42" />
      {/* White "X" mark representing Excel */}
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
  j_paid: number;
  k_unpaid: number;
  l_total_incurred: number;
  m_balance: number;
}

interface ExportButtonsProps {
  rows: ReportRow[];
  sectionOrder: string[];
  projectLabel: string;
  asOf: string;
}

const HEADERS = [
  "Code", "Category",
  "A - Original Budget", "B - Authorized Adj.", "C - Current Budget",
  "D - Proposed Adj.", "E - Projected Budget", "F - Variance",
  "G - Total Committed", "H - % Committed", "I - Uncommitted",
  "J - Costs to Date Paid", "K - Costs to Date Unpaid", "L - Total Costs Incurred", "M - Balance to Complete",
];

function fmt(n: number): number { return Math.round(n * 100) / 100; }
function fmtPct(n: number | null): string { return n != null ? `${n.toFixed(1)}%` : ""; }

function toRowArr(r: ReportRow): (string | number)[] {
  return [
    r.code, r.name,
    fmt(r.a_original), fmt(r.b_authorized), fmt(r.c_current),
    fmt(r.d_proposed), fmt(r.e_projected), fmt(r.f_variance),
    fmt(r.g_committed), fmtPct(r.h_pct_committed), fmt(r.i_uncommitted),
    fmt(r.j_paid), fmt(r.k_unpaid), fmt(r.l_total_incurred), fmt(r.m_balance),
  ];
}

export function ExportButtons({ rows, sectionOrder, projectLabel, asOf }: ExportButtonsProps) {
  const handleExcelExport = useCallback(async () => {
    const XLSX = await import("xlsx");

    const dateLabel = new Date(asOf + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const data: (string | number)[][] = [
      [projectLabel],
      [`Project Cost Management Report — As of ${dateLabel}`],
      [],
      HEADERS,
    ];

    const sectionMap = new Map<string, ReportRow[]>();
    for (const s of sectionOrder) sectionMap.set(s, []);
    for (const r of rows) sectionMap.get(r.section)?.push(r);

    const grand = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0, l: 0, m: 0 };

    for (const section of sectionOrder) {
      const sectionRows = (sectionMap.get(section) ?? []).filter(
        (r) => r.a_original || r.b_authorized || r.d_proposed || r.g_committed || r.l_total_incurred
      );
      if (sectionRows.length === 0) continue;

      data.push([section]);

      const sub = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, i: 0, j: 0, k: 0, l: 0, m: 0 };
      for (const r of sectionRows) {
        data.push(toRowArr(r));
        sub.a += r.a_original; sub.b += r.b_authorized; sub.c += r.c_current;
        sub.d += r.d_proposed; sub.e += r.e_projected; sub.f += r.f_variance;
        sub.g += r.g_committed; sub.i += r.i_uncommitted;
        sub.j += r.j_paid; sub.k += r.k_unpaid; sub.l += r.l_total_incurred; sub.m += r.m_balance;
        grand.a += r.a_original; grand.b += r.b_authorized; grand.c += r.c_current;
        grand.d += r.d_proposed; grand.e += r.e_projected; grand.f += r.f_variance;
        grand.g += r.g_committed; grand.i += r.i_uncommitted;
        grand.j += r.j_paid; grand.k += r.k_unpaid; grand.l += r.l_total_incurred; grand.m += r.m_balance;
      }

      data.push([
        "", `${section} — Subtotal`,
        fmt(sub.a), fmt(sub.b), fmt(sub.c),
        fmt(sub.d), fmt(sub.e), fmt(sub.f),
        fmt(sub.g), "", fmt(sub.i),
        fmt(sub.j), fmt(sub.k), fmt(sub.l), fmt(sub.m),
      ]);
      data.push([]);
    }

    data.push([
      "", "GRAND TOTAL",
      fmt(grand.a), fmt(grand.b), fmt(grand.c),
      fmt(grand.d), fmt(grand.e), fmt(grand.f),
      fmt(grand.g), "", fmt(grand.i),
      fmt(grand.j), fmt(grand.k), fmt(grand.l), fmt(grand.m),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 36 }, ...Array(13).fill({ wch: 20 })];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Management Report");
    const filePrefix = projectLabel.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `${filePrefix}_Cost_Management_${asOf}.xlsx`);
  }, [rows, sectionOrder, projectLabel, asOf]);

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

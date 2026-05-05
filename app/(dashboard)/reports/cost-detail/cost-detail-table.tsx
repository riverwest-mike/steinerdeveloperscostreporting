"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, X } from "lucide-react";
import { TransactionNoteCell } from "@/components/transaction-note-cell";
import { TransactionGateCell } from "@/components/transaction-gate-cell";
import { TransactionCategoryCell } from "@/components/transaction-category-cell";

interface GateInfo {
  id: string;
  name: string;
  sequence_number: number;
}

export interface CostDetailRow {
  id: string;
  appfolio_bill_id: string;
  appfolio_property_id: string;
  vendor_name: string;
  gl_account_id: string;
  gl_account_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  cost_category_code_override: string | null;
  bill_date: string | null;
  invoice_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  check_number: string | null;
  reference_number: string | null;
  description: string | null;
  // Pre-resolved context
  project_id: string | null;
  project_code: string | null;
  gate_id: string | null;
  gate_name: string | null;
  gate_sequence: number | null;
  gate_is_override: boolean;
  project_gates: GateInfo[];
  note: string | null;
}

interface Props {
  rows: CostDetailRow[];
  showProjectCol: boolean;
  categories: { id: string; name: string; code: string }[];
  canEditGate: boolean;
  isAdmin: boolean;
  appfolioBaseUrl: string | null;
}

type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir } | null;

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ColumnDef {
  key: string;
  label: string;
  align?: "left" | "right";
  filterValue: (r: CostDetailRow) => string;
  sortValue: (r: CostDetailRow) => string | number;
  render: (r: CostDetailRow, ctx: Props) => React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "project",
    label: "Project",
    filterValue: (r) => r.project_code ?? "",
    sortValue: (r) => r.project_code ?? "",
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">{r.project_code ?? "—"}</span>
    ),
  },
  {
    key: "bill_date",
    label: "Bill Date",
    filterValue: (r) => r.bill_date ?? "",
    sortValue: (r) => r.bill_date ?? "",
    render: (r) => (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">{fmtDate(r.bill_date)}</span>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    filterValue: (r) => r.vendor_name,
    sortValue: (r) => r.vendor_name.toLowerCase(),
    render: (r) => (
      <Link
        href={`/vendors/${encodeURIComponent(r.vendor_name)}`}
        className="text-blue-600 hover:underline font-medium"
      >
        {r.vendor_name}
      </Link>
    ),
  },
  {
    key: "description",
    label: "Description",
    filterValue: (r) => r.description ?? "",
    sortValue: (r) => (r.description ?? "").toLowerCase(),
    render: (r) => (
      <span className="text-muted-foreground block max-w-[200px] truncate" title={r.description ?? undefined}>
        {r.description ?? "—"}
      </span>
    ),
  },
  {
    key: "gl_account",
    label: "GL Account",
    filterValue: (r) => `${r.gl_account_id} ${r.gl_account_name}`,
    sortValue: (r) => r.gl_account_id,
    render: (r) => (
      <span className="whitespace-nowrap text-muted-foreground">
        <span className="font-mono">{r.gl_account_id || "—"}</span>
        {r.gl_account_name && <span className="ml-1 text-[10px]">{r.gl_account_name}</span>}
      </span>
    ),
  },
  {
    key: "cost_category",
    label: "Cost Category",
    filterValue: (r) => `${r.cost_category_code ?? ""} ${r.cost_category_name ?? ""}`,
    sortValue: (r) => r.cost_category_code ?? "",
    render: (r, ctx) => (
      <TransactionCategoryCell
        transactionId={r.id}
        currentCode={r.cost_category_code}
        currentName={r.cost_category_name}
        isOverride={!!r.cost_category_code_override}
        categories={ctx.categories}
        canEdit={ctx.canEditGate}
      />
    ),
  },
  {
    key: "invoice_amt",
    label: "Invoice Amt",
    align: "right",
    filterValue: (r) => String(r.invoice_amount),
    sortValue: (r) => Number(r.invoice_amount),
    render: (r, ctx) => {
      const value = usd(Number(r.invoice_amount));
      if (ctx.appfolioBaseUrl) {
        return (
          <a
            href={`${ctx.appfolioBaseUrl}/payable_bills/${r.appfolio_bill_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline tabular-nums font-medium"
            title="Open in AppFolio"
          >
            {value}
          </a>
        );
      }
      return <span className="tabular-nums font-medium">{value}</span>;
    },
  },
  {
    key: "paid",
    label: "Paid",
    align: "right",
    filterValue: (r) => String(r.paid_amount),
    sortValue: (r) => Number(r.paid_amount),
    render: (r) => (
      <span className="tabular-nums text-green-700">{usd(Number(r.paid_amount))}</span>
    ),
  },
  {
    key: "unpaid",
    label: "Unpaid",
    align: "right",
    filterValue: (r) => String(r.unpaid_amount),
    sortValue: (r) => Number(r.unpaid_amount),
    render: (r) =>
      Number(r.unpaid_amount) === 0 ? (
        <span className="tabular-nums text-amber-700">—</span>
      ) : (
        <span className="tabular-nums text-amber-700">{usd(Number(r.unpaid_amount))}</span>
      ),
  },
  {
    key: "status",
    label: "Status",
    filterValue: (r) => r.payment_status,
    sortValue: (r) => r.payment_status.toLowerCase(),
    render: (r) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
          /^paid$/i.test(r.payment_status)
            ? "bg-green-100 text-green-800"
            : /^unpaid$/i.test(r.payment_status)
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700"
        }`}
      >
        {r.payment_status}
      </span>
    ),
  },
  {
    key: "check_num",
    label: "Check #",
    filterValue: (r) => r.check_number ?? "",
    sortValue: (r) => r.check_number ?? "",
    render: (r) => <span className="text-muted-foreground">{r.check_number ?? "—"}</span>,
  },
  {
    key: "gate",
    label: "Gate",
    filterValue: (r) => r.gate_name ?? "",
    sortValue: (r) => r.gate_sequence ?? -1,
    render: (r, ctx) => (
      <TransactionGateCell
        transactionId={r.id}
        currentGateId={r.gate_id}
        currentGateName={r.gate_name}
        currentGateSequence={r.gate_sequence}
        isOverride={r.gate_is_override}
        projectGates={r.project_gates}
        canEdit={ctx.canEditGate}
      />
    ),
  },
  {
    key: "reference",
    label: "Reference",
    filterValue: (r) => r.reference_number ?? "",
    sortValue: (r) => r.reference_number ?? "",
    render: (r) => <span className="text-muted-foreground">{r.reference_number ?? "—"}</span>,
  },
  {
    key: "notes",
    label: "Notes",
    filterValue: (r) => r.note ?? "",
    sortValue: (r) => (r.note ?? "").toLowerCase(),
    render: (r, ctx) => (
      <TransactionNoteCell
        appfolioBillId={r.appfolio_bill_id}
        initialNote={r.note}
        isAdmin={ctx.isAdmin}
      />
    ),
  },
];

export function CostDetailTable(props: Props) {
  const { rows, showProjectCol } = props;
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openFilter) return;
    const handler = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilter]);

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => (c.key === "project" ? showProjectCol : true)),
    [showProjectCol]
  );

  const filteredAndSorted = useMemo(() => {
    let r = rows;
    for (const col of visibleColumns) {
      const f = filters[col.key]?.trim();
      if (!f) continue;
      const needle = f.toLowerCase();
      r = r.filter((row) => col.filterValue(row).toLowerCase().includes(needle));
    }
    if (sort) {
      const col = visibleColumns.find((c) => c.key === sort.key);
      if (col) {
        const sorted = [...r];
        sorted.sort((a, b) => {
          const av = col.sortValue(a);
          const bv = col.sortValue(b);
          if (av < bv) return sort.dir === "asc" ? -1 : 1;
          if (av > bv) return sort.dir === "asc" ? 1 : -1;
          return 0;
        });
        r = sorted;
      }
    }
    return r;
  }, [rows, visibleColumns, filters, sort]);

  const totalInvoice = filteredAndSorted.reduce((s, t) => s + Number(t.invoice_amount), 0);
  const totalPaid = filteredAndSorted.reduce((s, t) => s + Number(t.paid_amount), 0);
  const totalUnpaid = filteredAndSorted.reduce((s, t) => s + Number(t.unpaid_amount), 0);

  function cycleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function setFilter(key: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  const activeFilterCount = Object.values(filters).filter((v) => v.trim()).length;

  return (
    <>
      {(activeFilterCount > 0 || sort) && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground print:hidden">
          {activeFilterCount > 0 && (
            <span>
              Showing {filteredAndSorted.length} of {rows.length} rows
            </span>
          )}
          {sort && (
            <span>
              · Sorted by{" "}
              <span className="font-medium text-foreground">
                {visibleColumns.find((c) => c.key === sort.key)?.label}
              </span>{" "}
              {sort.dir === "asc" ? "ascending" : "descending"}
            </span>
          )}
          <button
            onClick={() => { setFilters({}); setSort(null); }}
            className="ml-auto inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm 8mm; }
          .overflow-x-auto { overflow: visible !important; }
          table { font-size: 7pt !important; min-width: 0 !important; width: 100% !important; table-layout: fixed; }
          th, td { padding: 1pt 3pt !important; white-space: normal !important; word-break: break-word; overflow: hidden; }
          th[data-col="description"], td[data-col="description"] { width: 18%; }
          th[data-col="vendor"], td[data-col="vendor"] { width: 16%; }
          th[data-col="notes"], td[data-col="notes"] { width: 14%; }
        }
      `}</style>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-800 text-white">
              {visibleColumns.map((col) => {
                const isSorted = sort?.key === col.key;
                const filterActive = !!filters[col.key]?.trim();
                const isFilterOpen = openFilter === col.key;
                return (
                  <th
                    key={col.key}
                    data-col={col.key}
                    className={`px-3 py-2.5 font-medium whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"} relative`}
                  >
                    <div className={`inline-flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""}`}>
                      <button
                        onClick={() => cycleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-200 transition-colors"
                        title={
                          isSorted
                            ? `Sorted ${sort!.dir === "asc" ? "ascending" : "descending"} — click to ${sort!.dir === "asc" ? "sort descending" : "clear"}`
                            : "Click to sort"
                        }
                      >
                        <span>{col.label}</span>
                        {isSorted ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                      <button
                        onClick={() => setOpenFilter((cur) => (cur === col.key ? null : col.key))}
                        className={`ml-1 rounded p-0.5 hover:bg-slate-700 transition-colors ${filterActive ? "text-amber-300" : "text-slate-400 hover:text-slate-200"} print:hidden`}
                        title={filterActive ? `Filtered: "${filters[col.key]}"` : "Filter this column"}
                        aria-label="Filter column"
                      >
                        <Filter className="h-3 w-3" />
                      </button>
                    </div>

                    {isFilterOpen && (
                      <div
                        ref={filterPopoverRef}
                        className="absolute right-2 top-full mt-1 z-30 w-56 rounded-md border bg-popover shadow-md p-2 print:hidden"
                      >
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="text"
                            value={filters[col.key] ?? ""}
                            onChange={(e) => setFilter(col.key, e.target.value)}
                            placeholder={`Filter ${col.label.toLowerCase()}…`}
                            className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setOpenFilter(null);
                              if (e.key === "Enter") setOpenFilter(null);
                            }}
                          />
                          {filterActive && (
                            <button
                              onClick={() => setFilter(col.key, "")}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Clear filter"
                              aria-label="Clear filter"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  No rows match the column filters.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      data-col={col.key}
                      className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""}`}
                    >
                      {col.render(r, props)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-400 bg-slate-800 text-white font-bold text-xs">
              {visibleColumns.map((col) => {
                if (col.key === "vendor") {
                  return (
                    <td key={col.key} data-col={col.key} className="px-3 py-3">
                      TOTAL — {filteredAndSorted.length} transaction{filteredAndSorted.length !== 1 ? "s" : ""}
                    </td>
                  );
                }
                if (col.key === "invoice_amt") {
                  return (
                    <td key={col.key} data-col={col.key} className="px-3 py-3 text-right tabular-nums">
                      {usd(totalInvoice)}
                    </td>
                  );
                }
                if (col.key === "paid") {
                  return (
                    <td key={col.key} data-col={col.key} className="px-3 py-3 text-right tabular-nums">
                      {usd(totalPaid)}
                    </td>
                  );
                }
                if (col.key === "unpaid") {
                  return (
                    <td key={col.key} data-col={col.key} className="px-3 py-3 text-right tabular-nums">
                      {totalUnpaid !== 0 ? usd(totalUnpaid) : "—"}
                    </td>
                  );
                }
                return <td key={col.key} data-col={col.key} className="px-3 py-3" />;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

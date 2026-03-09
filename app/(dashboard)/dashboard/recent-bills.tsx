"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { ExpandButton, ExpandedModal } from "@/components/expandable-card";

export interface BillRow {
  id: string;
  bill_date: string;
  vendor_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  project_name: string | null;
  project_id: string | null;
  description: string | null;
}

const DAY_OPTIONS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 3 days", days: 3 },
  { label: "Last week", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

const STATUS_OPTIONS = ["All", "Paid", "Unpaid", "Partial"] as const;

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function BillsTable({
  bills,
  expanded = false,
}: {
  bills: BillRow[];
  expanded?: boolean;
}) {
  const [days, setDays] = useState<number>(7);
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]>("All");
  const [vendorSearch, setVendorSearch] = useState("");

  const projects = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          bills.map((b) => b.project_name).filter(Boolean) as string[]
        )
      ).sort(),
    ],
    [bills]
  );

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [days]);

  const filtered = useMemo(() => {
    return bills
      .filter((b) => {
        if (b.bill_date < cutoff) return false;
        if (projectFilter !== "All" && b.project_name !== projectFilter)
          return false;
        if (statusFilter !== "All" && b.payment_status !== statusFilter)
          return false;
        if (
          vendorSearch &&
          !b.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((a, b) => b.bill_date.localeCompare(a.bill_date));
  }, [bills, cutoff, projectFilter, statusFilter, vendorSearch]);

  const totalAmount = filtered.reduce(
    (sum, b) => sum + b.paid_amount + b.unpaid_amount,
    0
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Recent Bills</h3>
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} bill{filtered.length !== 1 ? "s" : ""}
              &nbsp;·&nbsp;{usd(totalAmount)} total
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {expanded && (
            <>
              <input
                type="text"
                placeholder="Search vendor…"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring w-36"
              />
              {projects.length > 2 && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-1">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm rounded-md border border-input bg-background px-3 py-1.5 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No bills in the selected period.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className={expanded ? "" : "overflow-auto max-h-72"}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Project</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Cost Category
                  </th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(
                        bill.bill_date + "T00:00:00"
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">
                      {bill.project_id ? (
                        <Link
                          href={`/projects/${bill.project_id}`}
                          className="hover:underline hover:text-primary transition-colors"
                          title={bill.project_name ?? undefined}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {bill.project_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 max-w-[160px] truncate font-medium"
                      title={bill.vendor_name}
                    >
                      <Link
                        href={`/vendors/${encodeURIComponent(bill.vendor_name)}`}
                        className="hover:underline hover:text-primary transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {bill.vendor_name}
                      </Link>
                    </td>
                    <td
                      className="px-3 py-2 max-w-[160px] truncate text-muted-foreground"
                      title={
                        bill.cost_category_name ??
                        bill.cost_category_code ??
                        undefined
                      }
                    >
                      {bill.cost_category_code ? (
                        `${bill.cost_category_code}${
                          bill.cost_category_name
                            ? ` ${bill.cost_category_name}`
                            : ""
                        }`
                      ) : (
                        <span className="italic">Unmatched</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {usd(bill.paid_amount + bill.unpaid_amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          bill.payment_status === "Paid"
                            ? "bg-green-100 text-green-800"
                            : bill.payment_status === "Unpaid"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {bill.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecentBills({ bills }: { bills: BillRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative">
        <div className="absolute top-0 right-0 z-10">
          <ExpandButton onClick={() => setOpen(true)} />
        </div>
        <BillsTable bills={bills} />
      </div>
      <ExpandedModal open={open} onClose={() => setOpen(false)}>
        <BillsTable bills={bills} expanded />
      </ExpandedModal>
    </>
  );
}

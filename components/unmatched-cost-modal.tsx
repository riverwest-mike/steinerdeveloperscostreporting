"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

export interface UnmatchedTx {
  id: string;
  bill_date: string | null;
  vendor_name: string;
  description: string | null;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  check_number: string | null;
  reference_number: string | null;
}

interface Props {
  code: string;
  name: string;
  transactions: UnmatchedTx[];
  children: React.ReactNode;
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

export function UnmatchedCostModal({ code, name, transactions, children }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount), 0);
  const totalUnpaid = transactions.reduce((s, t) => s + Number(t.unpaid_amount), 0);

  const sorted = [...transactions].sort((a, b) =>
    (b.bill_date ?? "").localeCompare(a.bill_date ?? "")
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary underline underline-offset-2 hover:opacity-75 text-left"
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border">
            <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b">
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                  Unmatched AppFolio Cost
                </p>
                <h3 className="text-lg font-bold tracking-tight truncate">
                  {code === "(no cost category)" ? "(no cost category)" : code}
                  {name && name !== code && (
                    <span className="ml-2 text-base font-normal text-muted-foreground">{name}</span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                  {" · "}Paid {usd(totalPaid)}
                  {" · "}Unpaid {usd(totalUnpaid)}
                  {" · "}Total {usd(totalPaid + totalUnpaid)}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Bill Date</th>
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Unpaid</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Check #</th>
                    <th className="px-3 py-2 text-left font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                        {fmtDate(tx.bill_date)}
                      </td>
                      <td className="px-3 py-2 font-medium">{tx.vendor_name}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[260px] truncate" title={tx.description ?? undefined}>
                        {tx.description ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {tx.paid_amount > 0 ? usd(Number(tx.paid_amount)) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {tx.unpaid_amount > 0 ? usd(Number(tx.unpaid_amount)) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          tx.payment_status === "Paid"
                            ? "bg-green-100 text-green-800"
                            : tx.payment_status === "Unpaid"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                        }`}>
                          {tx.payment_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {tx.check_number ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {tx.reference_number ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
              These transactions came from AppFolio with a cost category code that is not defined in this app&rsquo;s
              cost categories. Add or rename a cost category in <span className="font-mono">Settings → Cost Categories</span> to
              re-classify them.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

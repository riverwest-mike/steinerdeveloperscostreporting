"use client";

import Link from "next/link";
import { useState } from "react";

export interface OverBudgetAlert {
  project_id: string;
  project_name: string;
  gate_id: string;
  gate_name: string;
  category_name: string;
  category_code: string;
  revised_budget: number;
  actual_amount: number;
  overage: number;
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

const CATEGORY_FILTERS = ["All", "5+ over", "10+ over"] as const;

export function BudgetAlerts({ alerts }: { alerts: OverBudgetAlert[] }) {
  const [filter, setFilter] = useState<(typeof CATEGORY_FILTERS)[number]>("All");

  if (alerts.length === 0) return null;

  const visible = alerts.filter((a) => {
    if (filter === "5+ over") return a.overage >= 5_000;
    if (filter === "10+ over") return a.overage >= 10_000;
    return true;
  });

  const totalOverage = alerts.reduce((sum, a) => sum + a.overage, 0);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
            Budget Alerts
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {alerts.length} cost {alerts.length === 1 ? "category" : "categories"} over budget
            &nbsp;·&nbsp;
            <span className="text-red-600 font-medium">{usd(totalOverage)}</span> total overage
          </p>
        </div>

        {/* Quick filters */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-red-100 text-red-700"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No alerts match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 divide-y divide-red-100">
          {visible.map((alert, i) => {
            const pctOver = alert.revised_budget > 0
              ? Math.round(((alert.actual_amount - alert.revised_budget) / alert.revised_budget) * 100)
              : null;

            return (
              <Link
                key={i}
                href={`/projects/${alert.project_id}/gates/${alert.gate_id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-red-50/50 transition-colors"
              >
                <span className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0 bg-red-400" />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">
                    {alert.project_name}
                    {alert.gate_name && (
                      <> &middot; {alert.gate_name}</>
                    )}
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    {alert.category_code} {alert.category_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Budget: {usd(alert.revised_budget)}
                    &nbsp;·&nbsp;
                    Actual: {usd(alert.actual_amount)}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-red-600">+{usd(alert.overage)}</p>
                  {pctOver !== null && (
                    <p className="text-[10px] text-red-400">{pctOver}% over</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

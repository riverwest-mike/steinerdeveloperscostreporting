"use client";

import Link from "next/link";

export interface PendingCO {
  id: string;
  project_id: string;
  project_name: string;
  co_number: string;
  description: string;
  amount: number;
  proposed_date: string; // YYYY-MM-DD
}

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function daysAgo(dateStr: string): number {
  const proposed = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - proposed.getTime()) / 86_400_000);
}

export function PendingCOs({ cos }: { cos: PendingCO[] }) {
  const totalAmount = cos.reduce((sum, co) => sum + co.amount, 0);

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-lg font-semibold">Pending Change Orders</h3>
        {cos.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {cos.length} awaiting approval &nbsp;·&nbsp; {usd(totalAmount)} total
          </p>
        )}
      </div>

      {cos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No change orders pending approval.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {cos.map((co) => {
            const age = daysAgo(co.proposed_date);
            const ageColor =
              age >= 14
                ? "text-red-600"
                : age >= 7
                ? "text-amber-600"
                : "text-muted-foreground";

            return (
              <Link
                key={co.id}
                href={`/projects/${co.project_id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                {/* Age indicator dot */}
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                    age >= 14
                      ? "bg-red-400"
                      : age >= 7
                      ? "bg-amber-400"
                      : "bg-muted-foreground/40"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">
                    {co.project_name}
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    {co.co_number}
                    <span className="ml-2 font-normal text-foreground/70">
                      {usd(co.amount)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {co.description}
                  </p>
                </div>

                <span className={`text-xs flex-shrink-0 ${ageColor}`}>
                  {age === 0 ? "Today" : `${age}d ago`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

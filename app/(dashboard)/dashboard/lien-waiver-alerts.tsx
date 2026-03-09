"use client";

import Link from "next/link";
import { useState } from "react";
import { ExpandButton, ExpandedModal } from "@/components/expandable-card";

export interface LienWaiverAlert {
  vendor_name: string;
  display_name: string;
  project_id: string | null;
  project_name: string | null;
  /** Conditional or Unconditional, etc. */
  coverage_type: string | null;
  expiration_date: string | null;
  days_until_expiry: number | null;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LienWaiverTable({
  alerts,
  expanded = false,
}: {
  alerts: LienWaiverAlert[];
  expanded?: boolean;
}) {
  const [projectFilter, setProjectFilter] = useState("All");
  const [vendorSearch, setVendorSearch] = useState("");

  const projects = [
    "All",
    ...Array.from(
      new Set(
        alerts.map((a) => a.project_name).filter(Boolean) as string[]
      )
    ).sort(),
  ];

  const visible = alerts.filter((a) => {
    if (projectFilter !== "All" && a.project_name !== projectFilter)
      return false;
    if (
      vendorSearch &&
      !a.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase())
    )
      return false;
    return true;
  });

  const expired = alerts.filter(
    (a) => a.days_until_expiry !== null && a.days_until_expiry < 0
  );
  const expiringSoon = alerts.filter(
    (a) => a.days_until_expiry !== null && a.days_until_expiry >= 0
  );
  const noExpiry = alerts.filter((a) => a.days_until_expiry === null);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Lien Waiver Alerts</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {expired.length > 0 && `${expired.length} expired`}
            {expired.length > 0 && expiringSoon.length > 0 && " · "}
            {expiringSoon.length > 0 &&
              `${expiringSoon.length} expiring within 60 days`}
            {noExpiry.length > 0 &&
              (expired.length + expiringSoon.length > 0 ? " · " : "") +
                `${noExpiry.length} no expiry set`}
          </p>
        </div>
        {expanded && (
          <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No lien waiver alerts match this filter.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className={expanded ? "" : "overflow-auto max-h-64"}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  {expanded && (
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                  )}
                  <th className="px-3 py-2 text-left font-medium">Document</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    Expires
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((alert, i) => {
                  const isExpired =
                    alert.days_until_expiry !== null &&
                    alert.days_until_expiry < 0;
                  const noExpiry = alert.days_until_expiry === null;

                  return (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/vendors/${encodeURIComponent(
                            alert.vendor_name
                          )}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          {alert.vendor_name}
                        </Link>
                      </td>
                      {expanded && (
                        <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">
                          {alert.project_name ?? "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">
                        {alert.display_name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {alert.coverage_type ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {alert.expiration_date ? (
                          <span
                            className={
                              isExpired
                                ? "text-destructive font-medium"
                                : "text-amber-700 font-medium"
                            }
                          >
                            {fmtDate(alert.expiration_date)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {noExpiry ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700">
                            No date set
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isExpired
                                ? "bg-red-100 text-red-800"
                                : alert.days_until_expiry! <= 30
                                ? "bg-orange-100 text-orange-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isExpired
                              ? `Expired ${Math.abs(alert.days_until_expiry!)}d ago`
                              : alert.days_until_expiry === 0
                              ? "Expires today"
                              : `${alert.days_until_expiry}d left`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function LienWaiverAlerts({ alerts }: { alerts: LienWaiverAlert[] }) {
  const [open, setOpen] = useState(false);

  if (alerts.length === 0) return null;

  return (
    <>
      <div className="relative">
        <div className="absolute top-0 right-0 z-10">
          <ExpandButton onClick={() => setOpen(true)} />
        </div>
        <LienWaiverTable alerts={alerts} />
      </div>
      <ExpandedModal open={open} onClose={() => setOpen(false)}>
        <LienWaiverTable alerts={alerts} expanded />
      </ExpandedModal>
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ExpandButton, ExpandedModal } from "@/components/expandable-card";

export interface COIAlert {
  vendor_name: string;
  display_name: string;
  expiration_date: string;
  days_until_expiry: number;
  coverage_type: string | null;
  project_id: string | null;
  project_name: string | null;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_FILTERS = ["All", "Expired", "≤30 days", "31–60 days"] as const;

interface COIFilterState {
  statusFilter: (typeof STATUS_FILTERS)[number];
  setStatusFilter: (s: (typeof STATUS_FILTERS)[number]) => void;
  coverageFilter: string;
  setCoverageFilter: (s: string) => void;
  vendorSearch: string;
  setVendorSearch: (s: string) => void;
}

function COITable({
  alerts,
  filters,
  expanded = false,
  onExpand,
}: {
  alerts: COIAlert[];
  filters: COIFilterState;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const { statusFilter, setStatusFilter, coverageFilter, setCoverageFilter, vendorSearch, setVendorSearch } = filters;

  const coverageTypes = [
    "All",
    ...Array.from(
      new Set(alerts.map((a) => a.coverage_type).filter(Boolean) as string[])
    ).sort(),
  ];

  const visible = alerts.filter((a) => {
    if (
      statusFilter === "Expired" &&
      a.days_until_expiry >= 0
    )
      return false;
    if (
      statusFilter === "≤30 days" &&
      (a.days_until_expiry < 0 || a.days_until_expiry > 30)
    )
      return false;
    if (
      statusFilter === "31–60 days" &&
      (a.days_until_expiry < 31 || a.days_until_expiry > 60)
    )
      return false;
    if (
      coverageFilter !== "All" &&
      a.coverage_type !== coverageFilter
    )
      return false;
    if (
      vendorSearch &&
      !a.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase())
    )
      return false;
    return true;
  });

  const expired = alerts.filter((a) => a.days_until_expiry < 0);
  const expiringSoon = alerts.filter((a) => a.days_until_expiry >= 0);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">COI Compliance Alerts</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {expired.length > 0 && `${expired.length} expired`}
            {expired.length > 0 && expiringSoon.length > 0 && " · "}
            {expiringSoon.length > 0 &&
              `${expiringSoon.length} expiring within 60 days`}
          </p>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} />}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input
            type="text"
            placeholder="Search vendor…"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring w-40"
          />
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === f
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {coverageTypes.length > 2 && (
            <select
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {coverageTypes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No COI alerts match this filter.
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
                  <th className="px-3 py-2 text-left font-medium">Coverage</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    Expires
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((alert, i) => {
                  const isExpired = alert.days_until_expiry < 0;
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
                        <span
                          className={
                            isExpired
                              ? "text-destructive font-medium"
                              : "text-amber-700 font-medium"
                          }
                        >
                          {fmtDate(alert.expiration_date)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isExpired
                              ? "bg-red-100 text-red-800"
                              : alert.days_until_expiry <= 30
                              ? "bg-orange-100 text-orange-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isExpired
                            ? `Expired ${Math.abs(alert.days_until_expiry)}d ago`
                            : alert.days_until_expiry === 0
                            ? "Expires today"
                            : `${alert.days_until_expiry}d left`}
                        </span>
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

export function COIAlerts({ alerts }: { alerts: COIAlert[] }) {
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [coverageFilter, setCoverageFilter] = useState("All");
  const [vendorSearch, setVendorSearch] = useState("");
  const filters: COIFilterState = {
    statusFilter, setStatusFilter, coverageFilter, setCoverageFilter, vendorSearch, setVendorSearch,
  };

  if (alerts.length === 0) return null;

  return (
    <>
      <COITable alerts={alerts} filters={filters} onExpand={() => setOpen(true)} />
      <ExpandedModal open={open} onClose={() => setOpen(false)}>
        <COITable alerts={alerts} filters={filters} expanded />
      </ExpandedModal>
    </>
  );
}

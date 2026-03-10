"use client";

import Link from "next/link";
import { useState } from "react";

interface Vendor {
  name: string;
  is_active: boolean;
}

interface VendorsSectionProps {
  projectId: string;
  vendors: Vendor[];
}

export function VendorsSection({ projectId, vendors }: VendorsSectionProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");

  const activeCount = vendors.filter((v) => v.is_active).length;
  const inactiveCount = vendors.filter((v) => !v.is_active).length;

  const displayed = vendors.filter((v) => {
    if (filter === "active" && !v.is_active) return false;
    if (filter === "inactive" && v.is_active) return false;
    if (search.trim() && !v.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="rounded-lg border mt-6">
      {/* Panel header — matches Gates & Contracts */}
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Vendors</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {vendors.length}
          </span>
          {activeCount > 0 && (
            <span className="text-xs text-green-700 font-medium hidden sm:inline">
              {activeCount} active
            </span>
          )}
          {inactiveCount > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              , {inactiveCount} inactive
            </span>
          )}
        </div>
        <Link
          href={`/projects/${projectId}/vendors`}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
        >
          Manage Vendors →
        </Link>
      </div>

      {/* Search + filter row */}
      {vendors.length > 0 && (
        <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="h-8 w-full max-w-xs rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex rounded-md border overflow-hidden text-xs font-medium w-fit">
            {(["active", "inactive", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 transition-colors capitalize ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "active"
                  ? `Active (${activeCount})`
                  : f === "inactive"
                  ? `Inactive (${inactiveCount})`
                  : `All (${vendors.length})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {vendors.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No vendors yet. Vendors are added automatically when AppFolio syncs
          or when contracts are entered.
        </div>
      ) : displayed.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {search
            ? `No vendors match "${search}".`
            : filter === "inactive"
            ? "No inactive vendors."
            : "No vendors match this filter."}
        </div>
      ) : (
        <div className="max-h-72 overflow-x-auto overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white sticky top-0">
                <th className="px-4 py-2.5 text-left text-xs font-medium">
                  Vendor Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((v) => (
                <tr
                  key={v.name}
                  className={`hover:bg-muted/30 transition-colors ${
                    !v.is_active ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/vendors/${encodeURIComponent(v.name)}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        v.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/vendors/${encodeURIComponent(v.name)}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

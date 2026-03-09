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
    <div className="space-y-4 mt-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}.{" "}
          <span className="text-green-700 font-medium">{activeCount} active</span>
          {inactiveCount > 0 && (
            <span className="text-muted-foreground">, {inactiveCount} inactive</span>
          )}.
        </p>
        <Link
          href={`/projects/${projectId}/vendors`}
          className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors shrink-0"
        >
          Manage Vendors →
        </Link>
      </div>

      {/* Search + filter row */}
      {vendors.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="h-9 w-full max-w-xs rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No vendors yet. Vendors are added automatically when AppFolio syncs
            or when contracts are entered.
          </p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? `No vendors match "${search}".`
              : filter === "inactive"
              ? "No inactive vendors."
              : "No vendors match this filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-medium">
                  Vendor Name
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Profile</th>
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

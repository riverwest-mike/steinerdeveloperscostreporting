"use client";

import Link from "next/link";
import { useState } from "react";

interface VendorsSectionProps {
  projectId: string;
  activeCount: number;
  totalCount: number;
  vendors: string[];
}

export function VendorsSection({ projectId, activeCount, totalCount, vendors }: VendorsSectionProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? vendors.filter((name) => name.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  const preview = search.trim() ? filtered : filtered.slice(0, 12);
  const overflow = search.trim() ? 0 : Math.max(0, filtered.length - 12);

  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Vendors</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {activeCount} active
          </span>
          {totalCount > activeCount && (
            <span className="text-xs text-muted-foreground">
              ({totalCount - activeCount} inactive)
            </span>
          )}
        </div>
        <Link
          href={`/projects/${projectId}/vendors`}
          className="rounded border px-3 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          Manage Vendors
        </Link>
      </div>

      {vendors.length > 0 && (
        <div className="px-4 pt-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-72"
            />
          </div>
        </div>
      )}

      {vendors.length > 0 ? (
        <div className="px-4 py-3 flex flex-wrap gap-1.5">
          {preview.length > 0 ? (
            <>
              {preview.map((name) => (
                <Link
                  key={name}
                  href={`/vendors/${encodeURIComponent(name)}`}
                  className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {name}
                </Link>
              ))}
              {overflow > 0 && (
                <Link
                  href={`/projects/${projectId}/vendors`}
                  className="inline-flex items-center rounded-full bg-muted/50 border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  +{overflow} more
                </Link>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No vendors match your search.</p>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No vendors yet. Vendors are added automatically when AppFolio syncs or when contracts are entered.
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addProjectVendor } from "./vendors/actions";

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
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAddTransition] = useTransition();

  const activeCount = vendors.filter((v) => v.is_active).length;
  const inactiveCount = vendors.filter((v) => !v.is_active).length;

  const displayed = vendors.filter((v) => {
    if (filter === "active" && !v.is_active) return false;
    if (filter === "inactive" && v.is_active) return false;
    if (search.trim() && !v.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAddError(null);
    startAddTransition(async () => {
      const result = await addProjectVendor(projectId, addName);
      if (result.error) { setAddError(result.error); return; }
      setAddName("");
      setShowAdd(false);
    });
  }

  return (
    <div className="rounded-lg border mt-6">
      {/* Panel header */}
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
        <button
          onClick={() => { setShowAdd((v) => !v); setAddError(null); setAddName(""); }}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          {showAdd ? "Cancel" : "Add Vendor"}
        </button>
      </div>

      {/* Inline add vendor form */}
      {showAdd && (
        <div className="px-4 py-4 border-b bg-muted/20">
          <form onSubmit={handleAdd} className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs font-medium">Vendor Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => { setAddName(e.target.value); setAddError(null); }}
                placeholder="Enter vendor name…"
                autoFocus
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
            <button
              type="submit"
              disabled={isAdding || !addName.trim()}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isAdding ? "Adding…" : "Add Vendor"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddName(""); setAddError(null); }}
              className="rounded border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

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
                <th className="px-4 py-2.5 text-right text-xs font-medium">Actions</th>
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
                      Edit →
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

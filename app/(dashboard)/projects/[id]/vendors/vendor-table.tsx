"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useConfirmDestructive } from "@/components/confirm-destructive";
import { addProjectVendor, setVendorActive, deleteProjectVendor, renameProjectVendor } from "./actions";

interface Vendor {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface VendorTableProps {
  projectId: string;
  vendors: Vendor[];
  canEdit: boolean;   // PM or admin
  isAdmin: boolean;
}


export function VendorTable({ projectId, vendors, canEdit, isAdmin }: VendorTableProps) {
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAddTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmDestructive = useConfirmDestructive();

  const displayed = vendors.filter((v) => {
    if (filter === "active" && !v.is_active) return false;
    if (filter === "inactive" && v.is_active) return false;
    if (search.trim() && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = vendors.filter((v) => v.is_active).length;
  const inactiveCount = vendors.filter((v) => !v.is_active).length;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAddError(null);
    startAddTransition(async () => {
      const result = await addProjectVendor(projectId, addName);
      if (result.error) { setAddError(result.error); return; }
      setAddName("");
    });
  }

  function startEdit(v: Vendor) {
    setEditingId(v.id);
    setEditName(v.name);
    setEditError(null);
  }

  function handleSaveRename(vendorId: string) {
    setEditError(null);
    startSaveTransition(async () => {
      const result = await renameProjectVendor(vendorId, projectId, editName);
      if (result.error) { setEditError(result.error); return; }
      setEditingId(null);
    });
  }

  function handleToggle(v: Vendor) {
    setActionError(null);
    startTransition(async () => {
      const result = await setVendorActive(v.id, projectId, !v.is_active);
      if (result.error) setActionError(result.error);
    });
  }

  async function handleDelete(v: Vendor) {
    const reason = await confirmDestructive({
      title: `Permanently delete vendor "${v.name}"?`,
      body: "This cannot be undone.",
      confirmLabel: "Delete vendor",
    });
    if (reason === null) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteProjectVendor(v.id, projectId);
      if (result.error) setActionError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}.
          {" "}<span className="text-green-700 font-medium">{activeCount} active</span>
          {inactiveCount > 0 && <span className="text-muted-foreground">, {inactiveCount} inactive</span>}.
        </p>
      </div>

      {/* Add vendor form — PM/admin only */}
      {canEdit && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Add Vendor</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={addName}
              onChange={(e) => { setAddName(e.target.value); setAddError(null); }}
              placeholder="Vendor name"
              className="flex-1 rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={isAdding || !addName.trim()}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {isAdding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="text-xs text-destructive mt-1.5">{addError}</p>}
        </form>
      )}

      {/* Search bar */}
      <div className="mb-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors…"
          className="h-9 w-full max-w-sm rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Filter chips */}
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
            {f === "active" ? `Active (${activeCount})` : f === "inactive" ? `Inactive (${inactiveCount})` : `All (${vendors.length})`}
          </button>
        ))}
      </div>

      {actionError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{actionError}</p>
      )}

      {/* Vendor table */}
      {displayed.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center">
          <p className="text-muted-foreground text-sm">
            {search ? `No vendors match "${search}".` : filter === "inactive" ? "No inactive vendors." : "No vendors yet — add one above."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-medium">Vendor Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Profile</th>
                {canEdit && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((v) => (
                <tr key={v.id} className={`hover:bg-muted/30 transition-colors ${!v.is_active ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {editingId === v.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => { setEditName(e.target.value); setEditError(null); }}
                          autoFocus
                          className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-64"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRename(v.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveRename(v.id)}
                          disabled={isSaving}
                          className="text-xs rounded bg-primary px-2.5 py-1 text-primary-foreground disabled:opacity-50"
                        >
                          {isSaving ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        {editError && <span className="text-xs text-destructive">{editError}</span>}
                      </div>
                    ) : (
                      <Link
                        href={`/vendors/${encodeURIComponent(v.name)}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {v.name}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      v.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                    }`}>
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
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingId !== v.id && (
                          <button
                            onClick={() => startEdit(v)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title="Rename"
                          >
                            Rename
                          </button>
                        )}
                        <button
                          onClick={() => handleToggle(v)}
                          disabled={isPending}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          title={v.is_active ? "Deactivate vendor" : "Reactivate vendor"}
                        >
                          {v.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(v)}
                            disabled={isPending}
                            className="text-xs text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
                            title="Permanently delete"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Inactive vendors are hidden from autocomplete in contract forms.
      </p>
    </div>
  );
}

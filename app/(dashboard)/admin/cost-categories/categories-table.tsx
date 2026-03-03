"use client";

import { useState, useTransition } from "react";
import { CategoryForm } from "./category-form";
import { toggleCategoryActive, seedDefaultCategories } from "./actions";

interface Category {
  id: string;
  name: string;
  code: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export function CategoriesTable({ categories }: { categories: Category[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, current: boolean) {
    startTransition(() => {
      toggleCategoryActive(id, current).catch((err) => alert(err.message));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Cost Categories</h3>
        {!showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            + New Category
          </button>
        )}
      </div>

      {showNew && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3">New Category</p>
          <CategoryForm onDone={() => setShowNew(false)} />
        </div>
      )}

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium w-12">#</th>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No categories yet.</p>
                  <button
                    onClick={() => {
                      if (!confirm("Load all 95 default cost categories? This cannot be undone.")) return;
                      startTransition(() => {
                        seedDefaultCategories().catch((err) => alert(err.message));
                      });
                    }}
                    disabled={isPending}
                    className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {isPending ? "Loading…" : "Load default categories (95)"}
                  </button>
                </td>
              </tr>
            )}
            {categories.map((cat) => (
              <>
                <tr key={cat.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{cat.display_order}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{cat.code}</td>
                  <td className="px-4 py-3 font-medium">{cat.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{cat.description ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        cat.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {cat.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(editingId === cat.id ? null : cat.id)}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(cat.id, cat.is_active)}
                        disabled={isPending}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {cat.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === cat.id && (
                  <tr key={`${cat.id}-edit`} className="border-b last:border-0 bg-muted/20">
                    <td colSpan={6} className="px-4 py-4">
                      <CategoryForm
                        editing={cat}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

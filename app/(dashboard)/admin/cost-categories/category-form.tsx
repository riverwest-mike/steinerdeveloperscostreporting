"use client";

import { useRef, useState, useTransition } from "react";
import { createCategory, updateCategory } from "./actions";

interface Category {
  id: string;
  name: string;
  code: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface CategoryFormProps {
  editing?: Category;
  onDone: () => void;
}

export function CategoryForm({ editing, onDone }: CategoryFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (editing) {
          await updateCategory(editing.id, fd);
        } else {
          await createCategory(fd);
          formRef.current?.reset();
        }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="name">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={editing?.name}
            placeholder="e.g. Site Work"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="code">
            Code <span className="text-destructive">*</span>
          </label>
          <input
            id="code"
            name="code"
            required
            defaultValue={editing?.code}
            placeholder="e.g. SITE"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm uppercase"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="description">
          Description
        </label>
        <input
          id="description"
          name="description"
          defaultValue={editing?.description ?? ""}
          placeholder="Optional description"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1 w-32">
        <label className="text-xs font-medium" htmlFor="display_order">
          Display Order <span className="text-destructive">*</span>
        </label>
        <input
          id="display_order"
          name="display_order"
          type="number"
          required
          min={1}
          defaultValue={editing?.display_order}
          placeholder="1"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving…" : editing ? "Save Changes" : "Add Category"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border px-4 py-1.5 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

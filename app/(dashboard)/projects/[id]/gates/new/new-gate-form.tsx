"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGate } from "../actions";

export function NewGateForm({
  projectId,
  nextSequence,
}: {
  projectId: string;
  nextSequence: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createGate(projectId, fd);
        if (result?.error) { setError(result.error); return; }
        router.push(`/projects/${projectId}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-seq">
            Gate # <span className="text-destructive">*</span>
          </label>
          <input
            id="gate-seq"
            name="sequence_number"
            type="number"
            required
            min={1}
            defaultValue={nextSequence}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-name">
            Gate Name <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="gate-name"
            name="name"
            placeholder="e.g. Acquisition"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-start">Start Date</label>
          <input
            id="gate-start"
            name="start_date"
            type="date"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-end">End Date</label>
          <input
            id="gate-end"
            name="end_date"
            type="date"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="gate-notes">Notes</label>
        <input
          id="gate-notes"
          name="notes"
          placeholder="Optional"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add Gate"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}`)}
          className="rounded border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

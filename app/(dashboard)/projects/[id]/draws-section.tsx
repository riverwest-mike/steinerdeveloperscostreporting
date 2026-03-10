"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDrawRequest, deleteDrawRequest } from "./draws/actions";

interface DrawRequest {
  id: string;
  draw_number: number;
  title: string | null;
  submission_date: string;
  status: string;
  lender: string | null;
  total_requested: number;
  created_at: string;
}

interface DrawsSectionProps {
  projectId: string;
  draws: DrawRequest[];
  projectLender: string | null;
  canEdit: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface NewDrawFormProps {
  projectId: string;
  projectLender: string | null;
  onCancel: () => void;
}

function NewDrawForm({ projectId, projectLender, onCancel }: NewDrawFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createDrawRequest(projectId, fd);
      if (result.error) { setError(result.error); return; }
      router.push(`/projects/${projectId}/draws/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 border-t bg-muted/30 space-y-4">
      <h4 className="text-sm font-semibold">New Draw Request</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="draw-date">
            Submission Date <span className="text-destructive">*</span>
          </label>
          <input
            id="draw-date"
            name="submission_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="draw-lender">
            Lender
          </label>
          <input
            id="draw-lender"
            name="lender"
            defaultValue={projectLender ?? ""}
            placeholder="e.g. First Midwest Bank"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="draw-title">
          Title / Description <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="draw-title"
          name="title"
          placeholder="e.g. Construction Draw #1"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="draw-notes">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="draw-notes"
          name="notes"
          rows={2}
          placeholder="Any notes about this draw…"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm resize-none"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Draw Request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-4 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DrawRow({
  draw,
  projectId,
  canEdit,
}: {
  draw: DrawRequest;
  projectId: string;
  canEdit: boolean;
}) {
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete Draw #${draw.draw_number}? This cannot be undone.`)) return;
    startDelete(async () => {
      await deleteDrawRequest(draw.id, projectId);
      router.refresh();
    });
  }

  return (
    <Link
      href={`/projects/${projectId}/draws/${draw.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0 group"
    >
      <div className="w-16 shrink-0 text-sm font-mono font-medium text-muted-foreground">
        #{draw.draw_number}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {draw.title || `Draw #${draw.draw_number}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {fmtDate(draw.submission_date)}{draw.lender ? ` · ${draw.lender}` : ""}
        </p>
      </div>
      <div className="text-sm font-medium tabular-nums shrink-0">
        {fmtCurrency(draw.total_requested)}
      </div>
      <div className="shrink-0">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[draw.status] ?? "bg-gray-100 text-gray-600"}`}>
          {draw.status}
        </span>
      </div>
      {canEdit && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
          title="Delete draw request"
        >
          {isDeleting ? "…" : "Delete"}
        </button>
      )}
    </Link>
  );
}

export function DrawsSection({ projectId, draws, projectLender, canEdit }: DrawsSectionProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Draw Requests</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {draws.length}
          </span>
        </div>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New Draw
          </button>
        )}
      </div>

      {draws.length === 0 && !showForm ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No draw requests yet.
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="block mx-auto mt-2 text-primary hover:underline text-sm"
            >
              Create the first draw request
            </button>
          )}
        </div>
      ) : (
        <>
          {draws.length > 0 && (
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/20">
                <div className="w-16 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">Draw</div>
                <div className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide tabular-nums shrink-0">Amount</div>
                <div className="shrink-0 w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</div>
                {canEdit && <div className="shrink-0 w-12" />}
              </div>
              {draws.map((d) => (
                <DrawRow key={d.id} draw={d} projectId={projectId} canEdit={canEdit} />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <NewDrawForm
          projectId={projectId}
          projectLender={projectLender}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

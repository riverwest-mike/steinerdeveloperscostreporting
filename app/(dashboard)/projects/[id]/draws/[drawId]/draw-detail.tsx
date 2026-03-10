"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateDrawRequest, updateDrawStatus, upsertDrawLines } from "../actions";

interface CostCategory {
  id: string;
  name: string;
  code: string;
  display_order: number;
}

interface DrawLine {
  cost_category_id: string;
  this_draw_amount: number;
  notes: string | null;
}

interface PreviousDraw {
  id: string;
  draw_number: number;
  status: string;
  lines: { cost_category_id: string; this_draw_amount: number }[];
}

interface DrawRequest {
  id: string;
  draw_number: number;
  title: string | null;
  submission_date: string;
  status: string;
  lender: string | null;
  notes: string | null;
}

interface BudgetRow {
  cost_category_id: string;
  revised_budget: number;
}

interface DrawDetailProps {
  draw: DrawRequest;
  projectId: string;
  projectName: string;
  categories: CostCategory[];
  lines: DrawLine[];
  budgets: BudgetRow[];
  previousDraws: PreviousDraw[];
  canEdit: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const STATUS_TRANSITIONS: Record<string, { label: string; next: "draft" | "submitted" | "approved" | "rejected" }[]> = {
  draft: [{ label: "Mark Submitted", next: "submitted" }],
  submitted: [{ label: "Mark Approved", next: "approved" }, { label: "Mark Rejected", next: "rejected" }],
  approved: [{ label: "Revert to Draft", next: "draft" }],
  rejected: [{ label: "Revert to Draft", next: "draft" }],
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

interface HeaderEditorProps {
  draw: DrawRequest;
  projectId: string;
  onClose: () => void;
}

function HeaderEditor({ draw, projectId, onClose }: HeaderEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateDrawRequest(draw.id, projectId, fd);
      if (result.error) { setError(result.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4 bg-card">
      <h3 className="text-sm font-semibold">Edit Draw Request</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium">
            Submission Date <span className="text-destructive">*</span>
          </label>
          <input
            name="submission_date"
            type="date"
            required
            defaultValue={draw.submission_date}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Lender</label>
          <input
            name="lender"
            defaultValue={draw.lender ?? ""}
            placeholder="e.g. First Midwest Bank"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Title / Description</label>
        <input
          name="title"
          defaultValue={draw.title ?? ""}
          placeholder="e.g. Construction Draw #1"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={draw.notes ?? ""}
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
          {isPending ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-4 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DrawDetail({
  draw,
  projectId,
  categories,
  lines,
  budgets,
  previousDraws,
  canEdit,
}: DrawDetailProps) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLines, setEditingLines] = useState(false);
  const [savingLines, startSaveLines] = useTransition();
  const [savingStatus, startSaveStatus] = useTransition();
  const [lineError, setLineError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const amountRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const noteRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const router = useRouter();

  // Build lookup maps
  const lineMap = new Map<string, DrawLine>(lines.map((l) => [l.cost_category_id, l]));
  const budgetMap = new Map<string, number>(budgets.map((b) => [b.cost_category_id, b.revised_budget]));

  // Previously drawn per category: sum of approved/submitted draws (excluding this one)
  const prevDrawnMap = new Map<string, number>();
  for (const pd of previousDraws) {
    if (pd.id === draw.id) continue;
    for (const pl of pd.lines) {
      prevDrawnMap.set(pl.cost_category_id, (prevDrawnMap.get(pl.cost_category_id) ?? 0) + pl.this_draw_amount);
    }
  }

  const sortedCategories = [...categories].sort((a, b) => a.display_order - b.display_order);

  // Totals
  const totalBudget = sortedCategories.reduce((sum, c) => sum + (budgetMap.get(c.id) ?? 0), 0);
  const totalPrevDrawn = sortedCategories.reduce((sum, c) => sum + (prevDrawnMap.get(c.id) ?? 0), 0);
  const totalThisDraw = sortedCategories.reduce((sum, c) => sum + (lineMap.get(c.id)?.this_draw_amount ?? 0), 0);
  const totalBalance = totalBudget - totalPrevDrawn - totalThisDraw;

  function handleSaveLines() {
    setLineError(null);
    const updatedLines = sortedCategories
      .map((c) => {
        const rawAmount = amountRefs.current.get(c.id)?.value ?? "0";
        const amount = parseFloat(rawAmount.replace(/[^0-9.-]/g, "")) || 0;
        const noteVal = noteRefs.current.get(c.id)?.value?.trim() || null;
        return { cost_category_id: c.id, this_draw_amount: amount, notes: noteVal };
      })
      .filter((l) => l.this_draw_amount !== 0 || (lineMap.get(l.cost_category_id)?.this_draw_amount ?? 0) !== 0);

    startSaveLines(async () => {
      const result = await upsertDrawLines(draw.id, projectId, updatedLines);
      if (result.error) { setLineError(result.error); return; }
      setEditingLines(false);
      router.refresh();
    });
  }

  function handleStatusChange(next: "draft" | "submitted" | "approved" | "rejected") {
    setStatusError(null);
    startSaveStatus(async () => {
      const result = await updateDrawStatus(draw.id, projectId, next);
      if (result.error) { setStatusError(result.error); return; }
      router.refresh();
    });
  }

  const transitions = STATUS_TRANSITIONS[draw.status] ?? [];

  return (
    <div className="space-y-5">
      {/* Header card */}
      {editingHeader ? (
        <HeaderEditor draw={draw} projectId={projectId} onClose={() => setEditingHeader(false)} />
      ) : (
        <div className="rounded-lg border p-4 bg-card space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold">
                  Draw #{draw.draw_number}{draw.title ? ` — ${draw.title}` : ""}
                </h2>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[draw.status] ?? ""}`}>
                  {draw.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>Submitted: {fmtDate(draw.submission_date)}</span>
                {draw.lender && <span>Lender: {draw.lender}</span>}
              </div>
              {draw.notes && <p className="mt-2 text-sm">{draw.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {canEdit && transitions.map((t) => (
                <button
                  key={t.next}
                  onClick={() => handleStatusChange(t.next)}
                  disabled={savingStatus}
                  className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {t.label}
                </button>
              ))}
              {canEdit && draw.status === "draft" && (
                <button
                  onClick={() => setEditingHeader(true)}
                  className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          {statusError && <p className="text-xs text-destructive">{statusError}</p>}
        </div>
      )}

      {/* Line items table */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Draw Line Items</h3>
          {canEdit && draw.status === "draft" && !editingLines && (
            <button
              onClick={() => setEditingLines(true)}
              className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              Edit Amounts
            </button>
          )}
          {editingLines && (
            <div className="flex gap-2">
              <button
                onClick={handleSaveLines}
                disabled={savingLines}
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingLines ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingLines(false); setLineError(null); }}
                className="rounded border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide w-16">Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Budget</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Prev. Drawn</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">This Draw</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedCategories.map((cat) => {
                const budget = budgetMap.get(cat.id) ?? 0;
                const prevDrawn = prevDrawnMap.get(cat.id) ?? 0;
                const thisDraw = lineMap.get(cat.id)?.this_draw_amount ?? 0;
                const balance = budget - prevDrawn - thisDraw;
                const hasData = budget !== 0 || prevDrawn !== 0 || thisDraw !== 0;

                if (!hasData && !editingLines) return null;

                return (
                  <tr key={cat.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{cat.code}</td>
                    <td className="px-4 py-2">{cat.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{budget ? fmtCurrency(budget) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{prevDrawn ? fmtCurrency(prevDrawn) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {editingLines ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={thisDraw || ""}
                          placeholder="0.00"
                          className="w-28 rounded border border-input bg-background px-2 py-1 text-sm text-right tabular-nums"
                          ref={(el) => {
                            if (el) amountRefs.current.set(cat.id, el);
                          }}
                        />
                      ) : (
                        thisDraw ? fmtCurrency(thisDraw) : "—"
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${balance < 0 ? "text-destructive font-medium" : ""}`}>
                      {fmtCurrency(balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-2" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtCurrency(totalBudget)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtCurrency(totalPrevDrawn)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtCurrency(totalThisDraw)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${totalBalance < 0 ? "text-destructive" : ""}`}>
                  {fmtCurrency(totalBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {lineError && <p className="px-4 pb-3 text-xs text-destructive">{lineError}</p>}

        {editingLines && (
          <div className="px-4 pb-3 pt-2 border-t text-xs text-muted-foreground">
            Enter the amount to request for each cost category in this draw. Leave blank or enter 0 to exclude a category.
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Draw Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-sm font-semibold tabular-nums">{fmtCurrency(totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Previously Drawn</p>
            <p className="text-sm font-semibold tabular-nums">{fmtCurrency(totalPrevDrawn)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">This Draw</p>
            <p className="text-sm font-semibold tabular-nums">{fmtCurrency(totalThisDraw)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance Remaining</p>
            <p className={`text-sm font-semibold tabular-nums ${totalBalance < 0 ? "text-destructive" : ""}`}>
              {fmtCurrency(totalBalance)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

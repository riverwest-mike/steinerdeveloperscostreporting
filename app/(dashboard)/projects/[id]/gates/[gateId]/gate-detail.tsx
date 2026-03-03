"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateGate, closeGate, deleteGate, updateGate, upsertGateBudgets } from "../actions";

interface Gate {
  id: string;
  name: string;
  sequence_number: number;
  status: string;
  is_locked: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

interface BudgetRow {
  cost_category_id: string;
  category_name: string;
  category_code: string;
  category_header: string;
  original_budget: number;
  approved_co_amount: number;
  revised_budget: number;
  actual_amount: number;
}

interface GateDetailProps {
  gate: Gate;
  projectId: string;
  budgetRows: BudgetRow[];
  isAdmin: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-800",
  closed: "bg-blue-100 text-blue-800",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export function GateDetail({ gate, projectId, budgetRows, isAdmin }: GateDetailProps) {
  const [editingInfo, setEditingInfo] = useState(false);

  return (
    <div className="space-y-6">
      {/* Gate header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{gate.name}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[gate.status] ?? "bg-gray-100"}`}>
              {gate.status}
            </span>
            {gate.is_locked && (
              <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">Locked</span>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">Gate {gate.sequence_number}</p>
        </div>

        <div className="flex gap-2">
          {!gate.is_locked && (
            <button
              onClick={() => setEditingInfo((v) => !v)}
              className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              {editingInfo ? "Cancel" : "Edit Gate"}
            </button>
          )}
          <GateStatusButton gate={gate} projectId={projectId} />
          {isAdmin && !gate.is_locked && (
            <DeleteGateButton gate={gate} projectId={projectId} />
          )}
        </div>
      </div>

      {/* Edit gate info */}
      {editingInfo && (
        <div className="rounded-lg border p-5 bg-muted/20 max-w-2xl">
          <EditGateForm gate={gate} projectId={projectId} onDone={() => setEditingInfo(false)} />
        </div>
      )}

      {/* Info row */}
      {!editingInfo && (
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <InfoCard label="Start Date" value={fmtDate(gate.start_date)} />
          <InfoCard label="End Date" value={fmtDate(gate.end_date)} />
          {gate.notes && <InfoCard label="Notes" value={gate.notes} />}
        </div>
      )}

      {/* Budget table */}
      <BudgetTable
        gateId={gate.id}
        projectId={projectId}
        rows={budgetRows}
        locked={gate.is_locked}
      />
    </div>
  );
}

/* ─── Status action button ─────────────────────────────── */

function GateStatusButton({ gate, projectId }: { gate: Gate; projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (gate.status === "pending") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const r = await activateGate(gate.id, projectId);
                if (r?.error) setError(r.error);
              } catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
            });
          }}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Activating…" : "Activate Gate"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (gate.status === "active") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          disabled={isPending}
          onClick={() => {
            if (!confirm("Close and lock this gate? This cannot be undone.")) return;
            setError(null);
            startTransition(async () => {
              try {
                const r = await closeGate(gate.id, projectId);
                if (r?.error) setError(r.error);
              } catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
            });
          }}
          className="rounded border border-destructive px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Closing…" : "Close Gate"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}

/* ─── Delete gate button (admin only) ──────────────────── */

function DeleteGateButton({ gate, projectId }: { gate: Gate; projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete "${gate.name}"? This will permanently remove the gate and all its budget data.`)) return;
          setError(null);
          startTransition(async () => {
            try {
              const r = await deleteGate(gate.id, projectId);
              if (r?.error) { setError(r.error); return; }
              router.push(`/projects/${projectId}`);
            } catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
          });
        }}
        className="rounded border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Deleting…" : "Delete Gate"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ─── Edit gate form ────────────────────────────────────── */

function EditGateForm({
  gate,
  projectId,
  onDone,
}: {
  gate: Gate;
  projectId: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateGate(gate.id, projectId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="edit-gate-name">
            Gate Name <span className="text-destructive">*</span>
          </label>
          <input
            id="edit-gate-name"
            name="name"
            required
            defaultValue={gate.name}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="edit-gate-seq">Gate #</label>
          <input
            id="edit-gate-seq"
            name="sequence_number"
            type="number"
            required
            min={1}
            defaultValue={gate.sequence_number}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="edit-gate-start">Start Date</label>
          <input
            id="edit-gate-start"
            name="start_date"
            type="date"
            defaultValue={gate.start_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="edit-gate-end">End Date</label>
          <input
            id="edit-gate-end"
            name="end_date"
            type="date"
            defaultValue={gate.end_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="edit-gate-notes">Notes</label>
          <input
            id="edit-gate-notes"
            name="notes"
            defaultValue={gate.notes ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border px-3 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Budget table ──────────────────────────────────────── */

function BudgetTable({
  gateId,
  projectId,
  rows,
  locked,
}: {
  gateId: string;
  projectId: string;
  rows: BudgetRow[];
  locked: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    rows.forEach((r) => {
      m[r.cost_category_id] = r.original_budget > 0 ? String(r.original_budget) : "";
    });
    return m;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Group rows by header category, preserving display_order
  const groups: { header: string; rows: BudgetRow[] }[] = [];
  for (const row of rows) {
    const header = row.category_header || "Other";
    const last = groups[groups.length - 1];
    if (last && last.header === header) {
      last.rows.push(row);
    } else {
      groups.push({ header, rows: [row] });
    }
  }

  const hasActuals = rows.some((r) => r.actual_amount > 0);

  const totalOriginal = rows.reduce(
    (s, r) => s + (parseFloat(values[r.cost_category_id] || "0") || 0),
    0
  );
  const totalCO = rows.reduce((s, r) => s + r.approved_co_amount, 0);
  const totalRevised = totalOriginal + totalCO;
  const totalActuals = rows.reduce((s, r) => s + r.actual_amount, 0);
  const totalVariance = totalRevised - totalActuals;

  function handleSave() {
    setError(null);
    setSaved(false);
    const budgetRows = rows.map((r) => ({
      cost_category_id: r.cost_category_id,
      original_budget: parseFloat(values[r.cost_category_id] || "0") || 0,
    }));
    startTransition(async () => {
      try {
        const result = await upsertGateBudgets(gateId, projectId, budgetRows);
        if (result?.error) { setError(result.error); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Budget by Category</h3>
        {!locked && (
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-600">Saved</span>}
            {error && <span className="text-xs text-destructive">{error}</span>}
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Budgets"}
            </button>
          </div>
        )}
        {locked && (
          <span className="text-xs text-muted-foreground">Gate is locked — budgets are read-only</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cost Category</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Original Budget</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Approved COs</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Revised Budget</th>
              {hasActuals && (
                <>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actuals</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Variance</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const grpOriginal = group.rows.reduce(
                (s, r) => s + (parseFloat(values[r.cost_category_id] || "0") || 0), 0
              );
              const grpCO = group.rows.reduce((s, r) => s + r.approved_co_amount, 0);
              const grpRevised = grpOriginal + grpCO;
              const grpActuals = group.rows.reduce((s, r) => s + r.actual_amount, 0);
              const grpVariance = grpRevised - grpActuals;

              return (
                <GroupRows key={group.header}>
                  {/* Header row */}
                  <tr className="bg-muted/40 border-b">
                    <td colSpan={hasActuals ? 6 : 4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.header}
                    </td>
                  </tr>
                  {/* Category rows */}
                  {group.rows.map((row) => {
                    const orig = parseFloat(values[row.cost_category_id] || "0") || 0;
                    const revised = orig + row.approved_co_amount;
                    const variance = revised - row.actual_amount;
                    return (
                      <tr key={row.cost_category_id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-4 py-2 pl-8">
                          <span className="font-mono text-xs text-muted-foreground">{row.category_code}</span>
                          <span className="mx-1.5 text-muted-foreground/40">—</span>
                          <span className="text-sm">{row.category_name}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {locked ? (
                            <span className="font-mono text-xs">
                              {row.original_budget > 0 ? fmtCurrency(row.original_budget) : "—"}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={values[row.cost_category_id] ?? ""}
                              onChange={(e) =>
                                setValues((v) => ({ ...v, [row.cost_category_id]: e.target.value }))
                              }
                              placeholder="0"
                              className="w-32 rounded border border-input bg-background px-2 py-1 text-xs text-right font-mono"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                          {row.approved_co_amount > 0 ? fmtCurrency(row.approved_co_amount) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {revised > 0 ? fmtCurrency(revised) : "—"}
                        </td>
                        {hasActuals && (
                          <>
                            <td className="px-4 py-2 text-right font-mono text-xs">
                              {row.actual_amount > 0 ? fmtCurrency(row.actual_amount) : "—"}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono text-xs ${
                              revised > 0 && variance < 0 ? "text-destructive font-medium" : ""
                            }`}>
                              {revised > 0 || row.actual_amount > 0 ? fmtCurrency(variance) : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {/* Subtotal row */}
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-1.5 pl-8 text-xs font-medium text-muted-foreground">
                      Subtotal
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs font-medium text-muted-foreground">
                      {grpOriginal > 0 ? fmtCurrency(grpOriginal) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs text-muted-foreground">
                      {grpCO > 0 ? fmtCurrency(grpCO) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs font-medium text-muted-foreground">
                      {grpRevised > 0 ? fmtCurrency(grpRevised) : "—"}
                    </td>
                    {hasActuals && (
                      <>
                        <td className="px-4 py-1.5 text-right font-mono text-xs font-medium text-muted-foreground">
                          {grpActuals > 0 ? fmtCurrency(grpActuals) : "—"}
                        </td>
                        <td className={`px-4 py-1.5 text-right font-mono text-xs font-medium ${
                          grpRevised > 0 && grpVariance < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}>
                          {grpRevised > 0 || grpActuals > 0 ? fmtCurrency(grpVariance) : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                </GroupRows>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-4 py-2.5 text-xs">Total</td>
              <td className="px-4 py-2.5 text-right font-mono text-xs">
                {totalOriginal > 0 ? fmtCurrency(totalOriginal) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                {totalCO > 0 ? fmtCurrency(totalCO) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs">
                {totalRevised > 0 ? fmtCurrency(totalRevised) : "—"}
              </td>
              {hasActuals && (
                <>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {totalActuals > 0 ? fmtCurrency(totalActuals) : "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${
                    totalRevised > 0 && totalVariance < 0 ? "text-destructive" : ""
                  }`}>
                    {totalRevised > 0 || totalActuals > 0 ? fmtCurrency(totalVariance) : "—"}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

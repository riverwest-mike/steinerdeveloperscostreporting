"use client";

import { useState, useTransition } from "react";
import {
  updateContract,
  createChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  voidChangeOrder,
  addContractLineItem,
  updateContractLineItem,
  deleteContractLineItem,
} from "../actions";

interface Gate { id: string; name: string; sequence_number: number }
interface Category { id: string; name: string; code: string }

interface Contract {
  id: string;
  vendor_name: string;
  contract_number: string | null;
  description: string;
  original_value: number;
  approved_co_amount: number;
  revised_value: number;
  retainage_pct: number;
  execution_date: string | null;
  substantial_completion_date: string | null;
  status: string;
  teams_url: string | null;
  notes: string | null;
  gate_id: string | null;
  cost_category_id: string;
  // junction table — all gates this contract spans
  contract_gates: { gate: { id: string; name: string; sequence_number: number } | null }[];
  category: { id: string; name: string; code: string } | null;
  // schedule of values line items
  contract_line_items: { id: string; cost_category_id: string; description: string | null; amount: number }[];
}

interface ChangeOrder {
  id: string;
  co_number: string;
  description: string;
  amount: number;
  status: string;
  proposed_date: string;
  approved_date: string | null;
  teams_url: string | null;
  notes: string | null;
}

const CONTRACT_STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  complete: "bg-blue-100 text-blue-800",
  terminated: "bg-red-100 text-red-700",
};

const CO_STATUS_STYLES: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  voided: "bg-gray-100 text-gray-500",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ContractDetail({
  contract, projectId, gates, categories, changeOrders,
}: {
  contract: Contract;
  projectId: string;
  gates: Gate[];
  categories: Category[];
  changeOrders: ChangeOrder[];
}) {
  const [editing, setEditing] = useState(false);
  const [showCoForm, setShowCoForm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">{contract.vendor_name}</h2>
            {contract.contract_number && (
              <span className="font-mono text-sm text-muted-foreground">{contract.contract_number}</span>
            )}
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CONTRACT_STATUS_STYLES[contract.status] ?? "bg-gray-100"}`}>
              {contract.status}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">{contract.description}</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          {editing ? "Cancel" : "Edit Contract"}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="rounded-lg border p-5 bg-muted/20">
          <EditContractForm
            contract={contract}
            projectId={projectId}
            gates={gates}
            categories={categories}
            onDone={() => setEditing(false)}
          />
        </div>
      )}

      {/* Info cards */}
      {!editing && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InfoCard
            label="Gates"
            value={
              contract.contract_gates.length > 0
                ? contract.contract_gates
                    .map((cg) => cg.gate ? `${cg.gate.sequence_number}. ${cg.gate.name}` : null)
                    .filter(Boolean)
                    .join(", ")
                : "—"
            }
          />
          <InfoCard label="Cost Category" value={contract.category ? `${contract.category.code} — ${contract.category.name}` : "—"} />
          <InfoCard label="Original Value" value={fmtCurrency(contract.original_value)} mono />
          <InfoCard label="Revised Value" value={fmtCurrency(contract.revised_value)} mono />
          <InfoCard label="Approved COs" value={contract.approved_co_amount !== 0 ? fmtCurrency(contract.approved_co_amount) : "—"} mono />
          <InfoCard label="Retainage" value={contract.retainage_pct > 0 ? `${contract.retainage_pct}%` : "—"} />
          <InfoCard label="Execution Date" value={fmtDate(contract.execution_date)} />
          <InfoCard label="Substantial Completion" value={fmtDate(contract.substantial_completion_date)} />
        </div>
      )}

      {!editing && contract.teams_url && (
        <div>
          <a
            href={contract.teams_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline underline-offset-2"
          >
            Open in Teams ↗
          </a>
        </div>
      )}

      {!editing && contract.notes && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm">{contract.notes}</p>
        </div>
      )}

      {/* Change orders */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Change Orders</h3>
          <button
            onClick={() => setShowCoForm((v) => !v)}
            className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            {showCoForm ? "Cancel" : "+ Add CO"}
          </button>
        </div>

        {showCoForm && (
          <div className="border-b px-4 py-4 bg-muted/20">
            <AddCOForm
              contractId={contract.id}
              projectId={projectId}
              contractGates={contract.contract_gates
                .map((cg) => cg.gate)
                .filter((g): g is Gate => g !== null)}
              costCategoryId={contract.cost_category_id}
              nextCoNumber={`CO-${String(changeOrders.length + 1).padStart(3, "0")}`}
              onDone={() => setShowCoForm(false)}
            />
          </div>
        )}

        {changeOrders.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">CO #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Proposed</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <CORow
                  key={co.id}
                  co={co}
                  contractId={contract.id}
                  projectId={projectId}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-4 py-2.5 text-xs" colSpan={2}>Total COs</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {fmtCurrency(changeOrders.reduce((s, co) => s + co.amount, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        ) : !showCoForm ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No change orders yet.
          </div>
        ) : null}
      </div>

      {/* Schedule of Values */}
      <SOVSection
        contractId={contract.id}
        projectId={projectId}
        originalValue={contract.original_value}
        lineItems={contract.contract_line_items}
        categories={categories}
      />
    </div>
  );
}

// ── Schedule of Values section ────────────────────────────────

interface LineItem { id: string; cost_category_id: string; description: string | null; amount: number }

function SOVSection({
  contractId, projectId, originalValue, lineItems, categories,
}: {
  contractId: string;
  projectId: string;
  originalValue: number;
  lineItems: LineItem[];
  categories: { id: string; name: string; code: string }[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sovTotal = lineItems.reduce((s, li) => s + Number(li.amount), 0);
  const diff = originalValue - sovTotal;
  const balanced = Math.abs(diff) < 0.01;

  function doDelete(lineItemId: string) {
    if (!confirm("Remove this line item?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteContractLineItem(lineItemId, contractId, projectId);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Schedule of Values</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Break this contract&apos;s value across multiple cost codes for PCM Report attribution.
            When line items are present they replace the top-level cost category for column G.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors shrink-0"
        >
          {showForm ? "Cancel" : "+ Add Line"}
        </button>
      </div>

      {showForm && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <SOVLineForm
            contractId={contractId}
            projectId={projectId}
            categories={categories}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {lineItems.length > 0 ? (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Cost Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => {
                const cat = categories.find((c) => c.id === li.cost_category_id);
                return editingId === li.id ? (
                  <tr key={li.id} className="border-b last:border-0 bg-muted/10">
                    <td colSpan={4} className="px-4 py-3">
                      <SOVLineForm
                        contractId={contractId}
                        projectId={projectId}
                        categories={categories}
                        lineItem={li}
                        onDone={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={li.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {cat ? `${cat.code}` : "—"}
                      <span className="ml-1.5 text-muted-foreground font-sans">{cat?.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{li.description ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtCurrency(li.amount)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setEditingId(li.id)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >Edit</button>
                        <button
                          disabled={isPending}
                          onClick={() => doDelete(li.id)}
                          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                        >Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`border-t font-medium ${balanced ? "bg-muted/30" : "bg-amber-50"}`}>
                <td className="px-4 py-2 text-xs" colSpan={2}>
                  SOV Total
                  {!balanced && (
                    <span className="ml-2 text-amber-700 font-normal">
                      ({diff > 0 ? `${fmtCurrency(diff)} unallocated` : `${fmtCurrency(Math.abs(diff))} over contract`})
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2 text-right font-mono text-xs ${!balanced ? "text-amber-700" : ""}`}>
                  {fmtCurrency(sovTotal)}
                  <span className="ml-1.5 text-muted-foreground font-sans font-normal">of {fmtCurrency(originalValue)}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          {error && <p className="px-4 pb-2 text-xs text-destructive">{error}</p>}
        </>
      ) : !showForm ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No line items yet. Without a Schedule of Values, the full contract value is
          attributed to its top-level cost category on the PCM Report.
        </div>
      ) : null}
    </div>
  );
}

function SOVLineForm({
  contractId, projectId, categories, lineItem, onDone,
}: {
  contractId: string;
  projectId: string;
  categories: { id: string; name: string; code: string }[];
  lineItem?: LineItem;
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
        const result = lineItem
          ? await updateContractLineItem(lineItem.id, contractId, projectId, fd)
          : await addContractLineItem(contractId, projectId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1 flex-1 min-w-40">
        <label className="text-xs font-medium">Cost Category <span className="text-destructive">*</span></label>
        <select
          name="cost_category_id"
          required
          defaultValue={lineItem?.cost_category_id ?? ""}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs"
        >
          <option value="">— Select —</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1 flex-1 min-w-32">
        <label className="text-xs font-medium">Description</label>
        <input
          name="description"
          defaultValue={lineItem?.description ?? ""}
          placeholder="Optional"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs"
        />
      </div>
      <div className="space-y-1 w-36">
        <label className="text-xs font-medium">Amount ($) <span className="text-destructive">*</span></label>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          defaultValue={lineItem?.amount ?? ""}
          placeholder="0.00"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs"
        />
      </div>
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving…" : lineItem ? "Update" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Change order row with inline actions ──────────────────────

function CORow({ co, contractId, projectId }: { co: ChangeOrder; contractId: string; projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doAction(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/10">
        <td className="px-4 py-3 font-mono text-xs">{co.co_number}</td>
        <td className="px-4 py-3 text-sm">
          <div>{co.description}</div>
          {co.teams_url && (
            <a href={co.teams_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline">Teams ↗</a>
          )}
        </td>
        <td className={`px-4 py-3 text-right font-mono text-xs ${co.amount < 0 ? "text-red-600" : ""}`}>
          {fmtCurrency(co.amount)}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(co.proposed_date)}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CO_STATUS_STYLES[co.status] ?? "bg-gray-100"}`}>
            {co.status}
          </span>
          {co.status === "approved" && co.approved_date && (
            <span className="ml-1.5 text-xs text-muted-foreground">{fmtDate(co.approved_date)}</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {co.status === "proposed" && (
              <>
                <button
                  disabled={isPending}
                  onClick={() => doAction(() => approveChangeOrder(co.id, contractId, projectId))}
                  className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={isPending}
                  onClick={() => doAction(() => rejectChangeOrder(co.id, contractId, projectId))}
                  className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {co.status === "approved" && (
              <button
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Void this approved CO? This will reduce the approved CO total.")) return;
                  doAction(() => voidChangeOrder(co.id, contractId, projectId));
                }}
                className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Void
              </button>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="px-4 pb-2 text-xs text-destructive">{error}</td>
        </tr>
      )}
    </>
  );
}

// ── Add CO form ───────────────────────────────────────────────

function AddCOForm({
  contractId, projectId, contractGates, costCategoryId, nextCoNumber, onDone,
}: {
  contractId: string;
  projectId: string;
  contractGates: Gate[];
  costCategoryId: string;
  nextCoNumber: string;
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
        const result = await createChangeOrder(contractId, projectId, costCategoryId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Change Order</p>
      {/* Gate field — hidden if only one gate, picker if multiple */}
      {contractGates.length === 1 ? (
        <input type="hidden" name="gate_id" value={contractGates[0].id} />
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-gate">
            Gate <span className="text-destructive">*</span>
          </label>
          <select
            id="co-gate"
            name="gate_id"
            required
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">— Select gate —</option>
            {contractGates.map((g) => (
              <option key={g.id} value={g.id}>{g.sequence_number}. {g.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-num">
            CO # <span className="text-destructive">*</span>
          </label>
          <input
            id="co-num"
            name="co_number"
            required
            defaultValue={nextCoNumber}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="co-desc">
            Description <span className="text-destructive">*</span>
          </label>
          <input
            id="co-desc"
            name="description"
            required
            placeholder="Scope change description"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-amount">
            Amount ($) <span className="text-destructive">*</span>
          </label>
          <input
            id="co-amount"
            name="amount"
            type="number"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-date">
            Proposed Date <span className="text-destructive">*</span>
          </label>
          <input
            id="co-date"
            name="proposed_date"
            type="date"
            required
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="co-teams">Teams URL</label>
          <input
            id="co-teams"
            name="teams_url"
            type="url"
            placeholder="https://teams.microsoft.com/…"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-notes">Notes</label>
          <input
            id="co-notes"
            name="notes"
            placeholder="Optional"
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
          {isPending ? "Adding…" : "Add CO"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit Contract form ────────────────────────────────────────

function EditContractForm({
  contract, projectId, gates, categories, onDone,
}: {
  contract: Contract;
  projectId: string;
  gates: Gate[];
  categories: Category[];
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
        const result = await updateContract(contract.id, projectId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-vendor">
            Vendor <span className="text-destructive">*</span>
          </label>
          <input
            id="ec-vendor"
            name="vendor_name"
            required
            defaultValue={contract.vendor_name}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-num">Contract #</label>
          <input
            id="ec-num"
            name="contract_number"
            defaultValue={contract.contract_number ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-status">Status</label>
          <select
            id="ec-status"
            name="status"
            defaultValue={contract.status}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="ec-desc">
          Description <span className="text-destructive">*</span>
        </label>
        <input
          id="ec-desc"
          name="description"
          required
          defaultValue={contract.description}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">
            Gates <span className="text-destructive">*</span>
          </p>
          {/* Pre-check gates from the contract_gates junction */}
          <div className="max-h-28 overflow-y-auto rounded border border-input bg-background p-1.5 space-y-0.5">
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-accent/50 select-none">
                <input
                  type="checkbox"
                  name="gate_ids"
                  value={g.id}
                  defaultChecked={contract.contract_gates.some((cg) => cg.gate?.id === g.id)}
                  className="rounded"
                />
                {g.sequence_number}. {g.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-cat">
            Category <span className="text-destructive">*</span>
          </label>
          <select
            id="ec-cat"
            name="cost_category_id"
            required
            defaultValue={contract.cost_category_id}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-value">
            Original Value ($) <span className="text-destructive">*</span>
          </label>
          <input
            id="ec-value"
            name="original_value"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={contract.original_value}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-ret">Retainage %</label>
          <input
            id="ec-ret"
            name="retainage_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={contract.retainage_pct}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-exec">Execution Date</label>
          <input
            id="ec-exec"
            name="execution_date"
            type="date"
            defaultValue={contract.execution_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-comp">Substantial Completion</label>
          <input
            id="ec-comp"
            name="substantial_completion_date"
            type="date"
            defaultValue={contract.substantial_completion_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-teams">Teams URL</label>
          <input
            id="ec-teams"
            name="teams_url"
            type="url"
            defaultValue={contract.teams_url ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="ec-notes">Notes</label>
        <textarea
          id="ec-notes"
          name="notes"
          rows={2}
          defaultValue={contract.notes ?? ""}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm resize-none"
        />
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
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

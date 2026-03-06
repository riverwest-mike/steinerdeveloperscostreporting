"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateContract,
  deleteContract,
  createChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  voidChangeOrder,
  updateChangeOrder,
  deleteChangeOrder,
  addContractLineItem,
  updateContractLineItem,
  deleteContractLineItem,
} from "../actions";
import { InfoTip } from "@/components/info-tip";

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
  contract_gates: { gate: { id: string; name: string; sequence_number: number } | null }[];
  category: { id: string; name: string; code: string } | null;
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
  rejection_reason: string | null;
  gate_id: string;
  cost_category_id: string;
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
  contract, projectId, gates, categories, changeOrders, isAdmin,
}: {
  contract: Contract;
  projectId: string;
  gates: Gate[];
  categories: Category[];
  changeOrders: ChangeOrder[];
  isAdmin?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showCoForm, setShowCoForm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm(`Delete contract "${contract.vendor_name}"? This will permanently remove all change orders and line items. This cannot be undone.`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteContract(contract.id, projectId);
      if (result?.error) { setDeleteError(result.error); return; }
      router.push(`/projects/${projectId}`);
    });
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            {editing ? "Cancel" : "Edit Contract"}
          </button>
          {isAdmin && !editing && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

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
          {contract.contract_line_items.length > 0 ? (
            <InfoCard
              label="Cost Category"
              value={`${contract.contract_line_items.length} categories via Schedule of Values`}
            />
          ) : (
            <InfoCard label="Cost Category" value={contract.category ? `${contract.category.code} — ${contract.category.name}` : "—"} />
          )}
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
          <a href={contract.teams_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline underline-offset-2">
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
                  gates={gates}
                  categories={categories}
                  isAdmin={isAdmin}
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

// ── CO row with inline edit, reject modal, delete ─────────────

function CORow({
  co, contractId, projectId, gates, categories, isAdmin,
}: {
  co: ChangeOrder;
  contractId: string;
  projectId: string;
  gates: Gate[];
  categories: Category[];
  isAdmin?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

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

  if (editing) {
    return (
      <tr className="border-b last:border-0 bg-muted/10">
        <td colSpan={6} className="px-4 py-4">
          <EditCOForm
            co={co}
            projectId={projectId}
            contractId={contractId}
            gates={gates}
            categories={categories}
            onDone={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/10">
        <td className="px-4 py-3 font-mono text-xs">{co.co_number}</td>
        <td className="px-4 py-3 text-sm">
          <div>{co.description}</div>
          {co.notes && <div className="text-xs text-muted-foreground mt-0.5">{co.notes}</div>}
          {co.rejection_reason && (
            <div className="text-xs text-destructive mt-0.5">Reason: {co.rejection_reason}</div>
          )}
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
          <div className="flex items-center gap-1.5 flex-wrap">
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
                  onClick={() => setShowRejectModal(true)}
                  className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  disabled={isPending}
                  onClick={() => setEditing(true)}
                  className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  Edit
                </button>
                {isAdmin && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (!confirm(`Delete CO "${co.co_number}"? This cannot be undone.`)) return;
                      doAction(() => deleteChangeOrder(co.id, projectId, contractId));
                    }}
                    className="rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
            {co.status === "approved" && (
              <button
                disabled={isPending}
                onClick={() => {
                  if (!confirm("Void this approved CO? This will reduce the approved CO total and update budget columns B and G.")) return;
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
      {showRejectModal && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <RejectModal
              co={co}
              contractId={contractId}
              projectId={projectId}
              onDone={() => setShowRejectModal(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Rejection modal ───────────────────────────────────────────

function RejectModal({
  co, contractId, projectId, onDone,
}: {
  co: ChangeOrder;
  contractId: string;
  projectId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await rejectChangeOrder(co.id, contractId, projectId, reason);
      if (r?.error) { setError(r.error); return; }
      onDone();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 mt-1"
    >
      <p className="text-sm font-medium">
        Reject <span className="font-mono">{co.co_number}</span> — {co.description}
      </p>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="reject-reason">
          Reason <span className="text-muted-foreground font-normal">(optional but recommended)</span>
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Explain why this CO is being rejected…"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm resize-none"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
        >
          {isPending ? "Rejecting…" : "Confirm Rejection"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit CO form (proposed only) ──────────────────────────────

function EditCOForm({
  co, projectId, gates, categories, onDone,
}: {
  co: ChangeOrder;
  projectId: string;
  contractId: string;
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
      const r = await updateChangeOrder(co.id, projectId, fd);
      if (r?.error) { setError(r.error); return; }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Edit Change Order</p>
      {gates.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-gate">Gate</label>
          <select id="eco-gate" name="gate_id" defaultValue={co.gate_id}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm">
            {gates.map((g) => (
              <option key={g.id} value={g.id}>{g.sequence_number}. {g.name}</option>
            ))}
          </select>
        </div>
      )}
      {gates.length === 1 && <input type="hidden" name="gate_id" value={gates[0].id} />}
      {gates.length === 0 && <input type="hidden" name="gate_id" value={co.gate_id} />}
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="eco-cat">Cost Category</label>
        <select id="eco-cat" name="cost_category_id" defaultValue={co.cost_category_id}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-num">CO #</label>
          <input id="eco-num" name="co_number" required defaultValue={co.co_number}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-desc">Description <span className="text-destructive">*</span></label>
          <input id="eco-desc" name="description" required defaultValue={co.description}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-amount">Amount ($) <span className="text-destructive">*</span></label>
          <input id="eco-amount" name="amount" type="number" step="0.01" required defaultValue={co.amount}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-date">Proposed Date</label>
          <input id="eco-date" name="proposed_date" type="date" required defaultValue={co.proposed_date}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-teams">Teams URL</label>
          <input id="eco-teams" name="teams_url" type="url" defaultValue={co.teams_url ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="eco-notes">Notes</label>
          <input id="eco-notes" name="notes" defaultValue={co.notes ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {isPending ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Add CO form ───────────────────────────────────────────────

function AddCOForm({
  contractId, projectId, contractGates, costCategoryId, onDone,
}: {
  contractId: string;
  projectId: string;
  contractGates: Gate[];
  costCategoryId: string;
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
      {contractGates.length === 1 ? (
        <input type="hidden" name="gate_id" value={contractGates[0].id} />
      ) : (
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-gate">
            Gate <span className="text-destructive">*</span>
            <InfoTip text="This contract spans multiple gates. Select the phase where this change order's work is occurring. The gate's budget will be updated when the CO is approved." />
          </label>
          <select id="co-gate" name="gate_id" required
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm">
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
            CO #
            <InfoTip text="Leave blank to auto-assign the next project-level CO number (e.g. CO-005). You may override this with your own numbering." />
          </label>
          <input id="co-num" name="co_number" placeholder="Auto"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm font-mono" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="co-desc">Description <span className="text-destructive">*</span></label>
          <input id="co-desc" name="description" required placeholder="Scope change description"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-amount">Amount ($) <span className="text-destructive">*</span></label>
          <input id="co-amount" name="amount" type="number" step="0.01" required placeholder="0.00"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-date">Proposed Date <span className="text-destructive">*</span></label>
          <input id="co-date" name="proposed_date" type="date" required
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="co-teams">Teams URL</label>
          <input id="co-teams" name="teams_url" type="url" placeholder="https://teams.microsoft.com/…"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="co-notes">Notes</label>
          <input id="co-notes" name="notes" placeholder="Optional"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {isPending ? "Adding…" : "Add CO"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
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
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-sm">Schedule of Values</h3>
            <InfoTip text="Use this section when one contract covers multiple cost codes — for example, a general contractor contract that includes sitework, concrete, and framing. Add a line for each cost code with the allocated dollar amount. The PCM Report's column G (Total Committed) will then split the contract's value across those cost codes. Approved change orders are added on top per their own cost code. Leave empty if this contract covers only one cost code." />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Allocate this contract&apos;s value by cost code. When line items exist, the PCM Report
            uses them for column G instead of the top-level cost category.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors shrink-0">
          {showForm ? "Cancel" : "+ Add Line"}
        </button>
      </div>

      {showForm && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <SOVLineForm contractId={contractId} projectId={projectId} categories={categories}
            onDone={() => setShowForm(false)} />
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
                      <SOVLineForm contractId={contractId} projectId={projectId} categories={categories}
                        lineItem={li} onDone={() => setEditingId(null)} />
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
                        <button onClick={() => setEditingId(li.id)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                        <button disabled={isPending} onClick={() => doDelete(li.id)}
                          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50">Remove</button>
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
        <label className="text-xs font-medium">
          Cost Category <span className="text-destructive">*</span>
          <InfoTip text="Pick the cost code that this portion of the contract's value should appear under on the PCM Report." />
        </label>
        <select name="cost_category_id" required defaultValue={lineItem?.cost_category_id ?? ""}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs">
          <option value="">— Select —</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1 flex-1 min-w-32">
        <label className="text-xs font-medium">Description</label>
        <input name="description" defaultValue={lineItem?.description ?? ""} placeholder="Optional"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs" />
      </div>
      <div className="space-y-1 w-36">
        <label className="text-xs font-medium">Amount ($) <span className="text-destructive">*</span></label>
        <input name="amount" type="number" step="0.01" required defaultValue={lineItem?.amount ?? ""} placeholder="0.00"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs" />
      </div>
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
      <div className="flex gap-2 pb-0.5">
        <button type="submit" disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {isPending ? "Saving…" : lineItem ? "Update" : "Add"}
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
          <label className="text-xs font-medium" htmlFor="ec-vendor">Vendor <span className="text-destructive">*</span></label>
          <input id="ec-vendor" name="vendor_name" required defaultValue={contract.vendor_name}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-num">Contract #</label>
          <input id="ec-num" name="contract_number" defaultValue={contract.contract_number ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-status">Status</label>
          <select id="ec-status" name="status" defaultValue={contract.status}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm">
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="ec-desc">Description <span className="text-destructive">*</span></label>
        <input id="ec-desc" name="description" required defaultValue={contract.description}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">
            Gates <span className="text-destructive">*</span>
            <InfoTip text="Select every project phase (gate) this contract's work falls within." />
          </p>
          <div className="max-h-28 overflow-y-auto rounded border border-input bg-background p-1.5 space-y-0.5">
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-accent/50 select-none">
                <input type="checkbox" name="gate_ids" value={g.id}
                  defaultChecked={contract.contract_gates.some((cg) => cg.gate?.id === g.id)}
                  className="rounded" />
                {g.sequence_number}. {g.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Cost Category</p>
          {contract.contract_line_items.length > 0 ? (
            <p className="text-sm py-1.5 text-muted-foreground italic">
              Defined by Schedule of Values below ({contract.contract_line_items.length} line{contract.contract_line_items.length !== 1 ? "s" : ""})
            </p>
          ) : (
            <p className="text-sm py-1.5">
              {contract.category ? `${contract.category.code} — ${contract.category.name}` : "—"}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-value">Original Value ($) <span className="text-destructive">*</span></label>
          <input id="ec-value" name="original_value" type="number" min={0} step="0.01" required
            defaultValue={contract.original_value}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-ret">Retainage %</label>
          <input id="ec-ret" name="retainage_pct" type="number" min={0} max={100} step="0.01"
            defaultValue={contract.retainage_pct}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-exec">Execution Date</label>
          <input id="ec-exec" name="execution_date" type="date" defaultValue={contract.execution_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-comp">Substantial Completion</label>
          <input id="ec-comp" name="substantial_completion_date" type="date"
            defaultValue={contract.substantial_completion_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="ec-teams">Teams URL</label>
          <input id="ec-teams" name="teams_url" type="url" defaultValue={contract.teams_url ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="ec-notes">Notes</label>
        <textarea id="ec-notes" name="notes" rows={2} defaultValue={contract.notes ?? ""}
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm resize-none" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
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

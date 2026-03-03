"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createContract } from "./contracts/actions";

interface Gate {
  id: string;
  name: string;
  sequence_number: number;
}

interface Category {
  id: string;
  name: string;
  code: string;
}

interface Contract {
  id: string;
  vendor_name: string;
  contract_number: string | null;
  description: string;
  original_value: number;
  approved_co_amount: number;
  revised_value: number;
  status: string;
  gate_id: string;
  cost_category_id: string;
  gate_name?: string;
  category_name?: string;
}

interface ContractsSectionProps {
  projectId: string;
  contracts: Contract[];
  gates: Gate[];
  categories: Category[];
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  complete: "bg-blue-100 text-blue-800",
  terminated: "bg-red-100 text-red-700",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export function ContractsSection({ projectId, contracts, gates, categories }: ContractsSectionProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Contracts</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Contract"}
        </button>
      </div>

      {showForm && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <AddContractForm
            projectId={projectId}
            gates={gates}
            categories={categories}
            onDone={() => setShowForm(false)}
          />
        </div>
      )}

      {contracts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Contract #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Gate</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Original</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Approved COs</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Revised</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/projects/${projectId}/contracts/${c.id}`}
                      className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      {c.vendor_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.contract_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.gate_name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.category_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{fmtCurrency(c.original_value)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {c.approved_co_amount !== 0 ? fmtCurrency(c.approved_co_amount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium">{fmtCurrency(c.revised_value)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-4 py-2.5 text-xs" colSpan={4}>Total ({contracts.length})</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.original_value, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.approved_co_amount, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.revised_value, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : !showForm ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No contracts yet. Contracts are linked to a gate and cost category.
        </div>
      ) : null}
    </div>
  );
}

// ── Add Contract inline form ──────────────────────────────────

function AddContractForm({
  projectId,
  gates,
  categories,
  onDone,
}: {
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
        const result = await createContract(projectId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Contract</p>

      {/* Row 1 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="c-vendor">
            Vendor <span className="text-destructive">*</span>
          </label>
          <input
            id="c-vendor"
            name="vendor_name"
            required
            placeholder="e.g. Acme Construction"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-num">Contract #</label>
          <input
            id="c-num"
            name="contract_number"
            placeholder="e.g. C-001"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-status">Status</label>
          <select
            id="c-status"
            name="status"
            defaultValue="active"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>

      {/* Row 2 */}
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="c-desc">
          Description <span className="text-destructive">*</span>
        </label>
        <input
          id="c-desc"
          name="description"
          required
          placeholder="Scope of work"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-gate">
            Gate <span className="text-destructive">*</span>
          </label>
          <select
            id="c-gate"
            name="gate_id"
            required
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>{g.sequence_number}. {g.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-cat">
            Cost Category <span className="text-destructive">*</span>
          </label>
          <select
            id="c-cat"
            name="cost_category_id"
            required
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-value">
            Original Value ($) <span className="text-destructive">*</span>
          </label>
          <input
            id="c-value"
            name="original_value"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="0.00"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-ret">Retainage %</label>
          <input
            id="c-ret"
            name="retainage_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue="0"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Row 4: Dates + Teams URL */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-exec">Execution Date</label>
          <input
            id="c-exec"
            name="execution_date"
            type="date"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-comp">Substantial Completion</label>
          <input
            id="c-comp"
            name="substantial_completion_date"
            type="date"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="c-teams">Teams URL</label>
          <input
            id="c-teams"
            name="teams_url"
            type="url"
            placeholder="https://teams.microsoft.com/…"
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
          {isPending ? "Adding…" : "Add Contract"}
        </button>
        <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

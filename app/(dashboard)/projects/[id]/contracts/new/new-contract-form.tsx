"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createContract } from "../actions";
import { InfoTip } from "@/components/info-tip";

interface Gate { id: string; name: string | null; sequence_number: number }
interface Category { id: string; name: string; code: string }
interface Vendor { name: string }

interface SovLine {
  key: string;
  cost_category_id: string;
  description: string;
  amount: string;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function NewContractForm({
  projectId,
  gates,
  categories,
  vendors,
}: {
  projectId: string;
  gates: Gate[];
  categories: Category[];
  vendors: Vendor[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [originalValue, setOriginalValue] = useState("");
  const keyRef = useRef(1);
  const [sovLines, setSovLines] = useState<SovLine[]>([
    { key: "0", cost_category_id: "", description: "", amount: "" },
  ]);
  const router = useRouter();

  function addSovLine() {
    setSovLines((prev) => [
      ...prev,
      { key: String(keyRef.current++), cost_category_id: "", description: "", amount: "" },
    ]);
  }

  function removeSovLine(key: string) {
    setSovLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: string, field: keyof Omit<SovLine, "key">, value: string) {
    setSovLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  }

  const totalValue = parseFloat(originalValue) || 0;
  const sovTotal = sovLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const sovDiff = totalValue - sovTotal;
  const sovBalanced = totalValue > 0 && Math.abs(sovDiff) < 0.01;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sovLines.length === 0) {
      setError("Add at least one Schedule of Values line.");
      return;
    }
    if (sovLines.some((l) => !l.cost_category_id)) {
      setError("Select a cost category for every Schedule of Values line.");
      return;
    }
    if (!sovBalanced) {
      setError(`Schedule of Values total (${fmtCurrency(sovTotal)}) must equal the Total Contract Value (${fmtCurrency(totalValue)})`);
      return;
    }
    setError(null);
    const fd = new FormData(e.currentTarget);
    // Serialize SOV lines as JSON into a hidden field
    fd.set("sov_lines", JSON.stringify(
      sovLines.map((l) => ({
        cost_category_id: l.cost_category_id,
        description: l.description.trim() || null,
        amount: parseFloat(l.amount) || 0,
      }))
    ));
    startTransition(async () => {
      try {
        const result = await createContract(projectId, fd);
        if (result?.error) { setError(result.error); return; }
        router.push(`/projects/${projectId}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Row 1: Vendor / Contract # / Status */}
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
            list={vendors.length > 0 ? "vendor-list" : undefined}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
          {vendors.length > 0 && (
            <datalist id="vendor-list">
              {vendors.map((v) => (
                <option key={v.name} value={v.name} />
              ))}
            </datalist>
          )}
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

      {/* Row 2: Description */}
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

      {/* Row 3: Gates / Total Value / Retainage */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">
            Gates <span className="text-destructive">*</span>
            <InfoTip text="Select every project phase (gate) this contract's work falls within. If the work spans more than one phase, check all that apply." />
          </p>
          <div className="max-h-28 overflow-y-auto rounded border border-input bg-background p-1.5 space-y-0.5">
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-accent/50 select-none">
                <input type="checkbox" name="gate_ids" value={g.id} className="rounded" />
                <span className="font-mono">#{g.sequence_number}</span>
                {g.name && <span className="text-muted-foreground">{g.name}</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="c-value">
            Total Contract Value ($) <span className="text-destructive">*</span>
          </label>
          <input
            id="c-value"
            name="original_value"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="0.00"
            value={originalValue}
            onChange={(e) => setOriginalValue(e.target.value)}
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

      {/* Schedule of Values */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">
              Schedule of Values <span className="text-destructive">*</span>
            </h3>
            <InfoTip text="Allocate the contract value across one or more cost codes. Add one line for a single-cost-code contract, or multiple lines when the contract spans several codes. The PCM Report uses these lines for the Total Committed column." />
            {totalValue > 0 && (
              <span className={`ml-2 text-xs font-medium ${sovBalanced ? "text-green-700" : "text-amber-700"}`}>
                {sovBalanced ? `✓ ${fmtCurrency(sovTotal)} allocated` : `${fmtCurrency(sovTotal)} of ${fmtCurrency(totalValue)} — ${fmtCurrency(Math.abs(sovDiff))} ${sovDiff > 0 ? "remaining" : "over"}`}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={addSovLine}
            className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            + Add Line
          </button>
        </div>

        <div className="divide-y">
          {sovLines.map((line) => (
            <div key={line.key} className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <select
                  value={line.cost_category_id}
                  onChange={(e) => updateLine(line.key, "cost_category_id", e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">— Cost Code —</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-5">
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={line.description}
                  onChange={(e) => updateLine(line.key, "description", e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Amount"
                  value={line.amount}
                  onChange={(e) => updateLine(line.key, "amount", e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs text-right font-mono"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeSovLine(line.key)}
                  disabled={sovLines.length === 1}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {/* SOV total footer */}
          <div className={`px-4 py-2 flex items-center justify-between text-xs font-medium ${totalValue > 0 && !sovBalanced ? "bg-amber-50" : "bg-muted/30"}`}>
            <span className={totalValue > 0 && !sovBalanced ? "text-amber-700" : "text-muted-foreground"}>SOV Total</span>
            <span className={`font-mono ${totalValue > 0 && !sovBalanced ? "text-amber-700" : ""}`}>
              {fmtCurrency(sovTotal)}
              {totalValue > 0 && (
                <span className="ml-2 text-muted-foreground font-normal">
                  of {fmtCurrency(totalValue)}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Row 4: Dates / Teams URL */}
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
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add Contract"}
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

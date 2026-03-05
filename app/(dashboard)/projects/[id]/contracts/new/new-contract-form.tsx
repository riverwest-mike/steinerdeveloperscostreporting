"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createContract } from "../actions";
import { InfoTip } from "@/components/info-tip";

interface Gate { id: string; name: string | null; sequence_number: number }
interface Category { id: string; name: string; code: string }

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
}: {
  projectId: string;
  gates: Gate[];
  categories: Category[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [originalValue, setOriginalValue] = useState("");
  const [sovLines, setSovLines] = useState<SovLine[]>([]);
  const keyRef = useRef(0);
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
  const sovBalanced = sovLines.length === 0 || Math.abs(sovDiff) < 0.01;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sovLines.length > 0 && !sovBalanced) {
      setError(`Schedule of Values total (${fmtCurrency(sovTotal)}) must equal the Total Contract Value (${fmtCurrency(totalValue)})`);
      return;
    }
    setError(null);
    const fd = new FormData(e.currentTarget);
    // Serialize SOV lines as JSON into a hidden field
    if (sovLines.length > 0) {
      fd.set("sov_lines", JSON.stringify(
        sovLines.map((l) => ({
          cost_category_id: l.cost_category_id,
          description: l.description.trim() || null,
          amount: parseFloat(l.amount) || 0,
        }))
      ));
    }
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

      {/* Row 3: Gates / Category / Total Value / Retainage */}
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
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-cat">
            Primary Cost Category <span className="text-destructive">*</span>
            <InfoTip text="The primary cost code for this contract. If it covers multiple cost codes, add a Schedule of Values below to break it down — the PCM Report will use the SOV lines instead." />
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
            <h3 className="text-sm font-semibold">Schedule of Values</h3>
            <InfoTip text="Optional. Add lines here if this contract covers multiple cost codes. The PCM Report will split the committed amount per cost code. Leave empty if the contract maps to a single cost code." />
            {totalValue > 0 && sovLines.length > 0 && (
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

        {sovLines.length > 0 ? (
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
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {/* SOV total footer */}
            <div className={`px-4 py-2 flex items-center justify-between text-xs font-medium ${!sovBalanced ? "bg-amber-50" : "bg-muted/30"}`}>
              <span className={!sovBalanced ? "text-amber-700" : "text-muted-foreground"}>SOV Total</span>
              <span className={`font-mono ${!sovBalanced ? "text-amber-700" : ""}`}>
                {fmtCurrency(sovTotal)}
                {totalValue > 0 && (
                  <span className="ml-2 text-muted-foreground font-normal">
                    of {fmtCurrency(totalValue)}
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 text-xs text-muted-foreground text-center">
            No lines added. Click <strong>+ Add Line</strong> to break the contract value across multiple cost codes.
          </div>
        )}
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

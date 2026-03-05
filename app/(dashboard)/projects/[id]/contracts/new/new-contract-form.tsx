"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContract } from "../actions";
import { InfoTip } from "@/components/info-tip";

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
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
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
          <p className="text-xs font-medium">
            Gates <span className="text-destructive">*</span>
            <InfoTip text="Select every project phase (gate) this contract's work falls within. If the work spans more than one phase, check all that apply. When you add a change order later you will pick which specific gate it applies to." />
          </p>
          <div className="max-h-28 overflow-y-auto rounded border border-input bg-background p-1.5 space-y-0.5">
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-accent/50 select-none">
                <input type="checkbox" name="gate_ids" value={g.id} className="rounded" />
                {g.sequence_number}. {g.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="c-cat">
            Cost Category <span className="text-destructive">*</span>
            <InfoTip text="This cost code determines which row of the PCM Report this contract appears in (column G – Total Committed). If the contract covers only one cost code, select it here and you're done. If it covers multiple cost codes (e.g. a general contractor contract), select the primary code here, save, then open the contract and use the Schedule of Values section to allocate amounts by cost code." />
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

      {/* Row 4 */}
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

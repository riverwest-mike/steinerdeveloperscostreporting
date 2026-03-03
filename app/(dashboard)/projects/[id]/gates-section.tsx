"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createGate } from "./gates/actions";
import { UploadGatesModal } from "./gates/upload-gates-modal";

interface Gate {
  id: string;
  name: string;
  sequence_number: number;
  status: string;
  is_locked: boolean;
  start_date: string | null;
  end_date: string | null;
  total_budget: number;
}

interface GatesSectionProps {
  projectId: string;
  gates: Gate[];
}

const GATE_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-800",
  closed: "bg-blue-100 text-blue-800",
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
  });
}

type PanelMode = "add" | "upload" | null;

export function GatesSection({ projectId, gates }: GatesSectionProps) {
  const [panel, setPanel] = useState<PanelMode>(null);

  function togglePanel(mode: PanelMode) {
    setPanel((prev) => (prev === mode ? null : mode));
  }

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Gates</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => togglePanel("upload")}
            className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            {panel === "upload" ? "Cancel" : "Upload Excel"}
          </button>
          <button
            onClick={() => togglePanel("add")}
            className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
          >
            {panel === "add" ? "Cancel" : "+ Add Gate"}
          </button>
        </div>
      </div>

      {panel === "upload" && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <UploadGatesModal
            projectId={projectId}
            existingGates={gates.map((g) => ({
              id: g.id,
              name: g.name,
              sequence_number: g.sequence_number,
              is_locked: g.is_locked,
            }))}
            onDone={() => setPanel(null)}
          />
        </div>
      )}

      {panel === "add" && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <AddGateForm
            projectId={projectId}
            nextSequence={(gates.length > 0 ? Math.max(...gates.map((g) => g.sequence_number)) : 0) + 1}
            onDone={() => setPanel(null)}
          />
        </div>
      )}

      {gates.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Start</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">End</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Budget</th>
            </tr>
          </thead>
          <tbody>
            {gates.map((gate) => (
              <tr key={gate.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {gate.sequence_number}
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/projects/${projectId}/gates/${gate.id}`}
                    className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                  >
                    {gate.name}
                  </Link>
                  {gate.is_locked && (
                    <span className="ml-2 text-xs text-muted-foreground">🔒</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      GATE_STATUS_STYLES[gate.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {gate.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(gate.start_date)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(gate.end_date)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {gate.total_budget > 0 ? fmtCurrency(gate.total_budget) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !panel ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No gates yet. Gates represent sequential phases of the project.
        </div>
      ) : null}
    </div>
  );
}

function AddGateForm({
  projectId,
  nextSequence,
  onDone,
}: {
  projectId: string;
  nextSequence: number;
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
        const result = await createGate(projectId, fd);
        if (result?.error) { setError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Gate</p>
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-name">
            Gate Name <span className="text-destructive">*</span>
          </label>
          <input
            id="gate-name"
            name="name"
            required
            placeholder="e.g. Acquisition"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-seq">
            Sequence #
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
      </div>
      <div className="grid grid-cols-4 gap-3">
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
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="gate-notes">Notes</label>
          <input
            id="gate-notes"
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
          {isPending ? "Adding…" : "Add Gate"}
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

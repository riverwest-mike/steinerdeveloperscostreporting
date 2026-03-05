"use client";

import { useState } from "react";
import Link from "next/link";
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

export function GatesSection({ projectId, gates }: GatesSectionProps) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Gates</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {gates.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {showUpload ? "Cancel" : "Upload Excel"}
          </button>
          <Link
            href={`/projects/${projectId}/gates/new`}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            + Add Gate
          </Link>
        </div>
      </div>

      {showUpload && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <UploadGatesModal
            projectId={projectId}
            existingGates={gates.map((g) => ({
              id: g.id,
              name: g.name,
              sequence_number: g.sequence_number,
              is_locked: g.is_locked,
            }))}
            onDone={() => setShowUpload(false)}
          />
        </div>
      )}

      {gates.length > 0 ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 sticky top-0">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Gate</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Start</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">End</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Budget</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((gate) => (
                <tr key={gate.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/projects/${projectId}/gates/${gate.id}`}
                      className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      <span className="font-mono">#{gate.sequence_number}</span>
                      {gate.name && <span className="ml-2 text-muted-foreground font-normal">{gate.name}</span>}
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
        </div>
      ) : !showUpload ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No gates yet.{" "}
          <Link href={`/projects/${projectId}/gates/new`} className="text-primary hover:underline underline-offset-2">
            Add the first gate
          </Link>{" "}
          to start tracking project phases.
        </div>
      ) : null}
    </div>
  );
}

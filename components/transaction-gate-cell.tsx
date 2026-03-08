"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X, GitBranch } from "lucide-react";
import { updateTransactionGate } from "@/app/actions/transaction-gate";

interface Gate {
  id: string;
  name: string;
  sequence_number: number;
}

interface Props {
  transactionId: string;
  currentGateId: string | null;
  currentGateName: string | null;
  currentGateSequence: number | null;
  isOverride: boolean;
  projectGates: Gate[];
  canEdit: boolean;
}

export function TransactionGateCell({
  transactionId,
  currentGateId,
  currentGateName,
  currentGateSequence,
  isOverride,
  projectGates,
  canEdit,
}: Props) {
  const [gateId, setGateId] = useState(currentGateId);
  const [gateName, setGateName] = useState(currentGateName);
  const [gateSeq, setGateSeq] = useState(currentGateSequence);
  const [override, setOverride] = useState(isOverride);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentGateId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openEdit() {
    setDraft(gateId ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save() {
    if (!draft) { cancel(); return; }
    startTransition(async () => {
      const res = await updateTransactionGate(transactionId, draft);
      if (res.error) { setError(res.error); return; }
      const selected = projectGates.find((g) => g.id === draft);
      setGateId(draft);
      setGateName(selected?.name ?? null);
      setGateSeq(selected?.sequence_number ?? null);
      setOverride(true);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        >
          <option value="">— Select Gate —</option>
          {projectGates.map((g) => (
            <option key={g.id} value={g.id}>
              Gate {g.sequence_number} — {g.name}
            </option>
          ))}
        </select>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
        <div className="flex gap-1">
          <button
            onClick={save}
            disabled={isPending || !draft}
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-2.5 w-2.5" /> Save
          </button>
          <button
            onClick={cancel}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium hover:bg-accent"
          >
            <X className="h-2.5 w-2.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/gate flex items-center gap-1 min-w-[120px]">
      {gateId ? (
        <span className="text-[11px] text-foreground whitespace-nowrap">
          <span className="font-mono text-[10px] text-muted-foreground mr-1">G{gateSeq}</span>
          {gateName}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic">— No Gate —</span>
      )}
      {override && gateId && (
        <span
          title="Manually assigned"
          className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400"
        />
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      {canEdit && (
        <div className="ml-auto shrink-0 print:hidden">
          <button
            onClick={openEdit}
            title="Edit gate assignment"
            className="rounded p-0.5 hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// Compact icon-only variant used in the gate report header column
export function GateIcon() {
  return <GitBranch className="h-3.5 w-3.5" />;
}

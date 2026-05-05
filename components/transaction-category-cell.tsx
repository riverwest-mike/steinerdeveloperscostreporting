"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { updateTransactionCostCategory } from "@/app/actions/transaction-category";

interface Category {
  id: string;
  name: string;
  code: string;
}

interface Props {
  transactionId: string;
  currentCode: string | null;
  currentName: string | null;
  isOverride: boolean;
  categories: Category[];
  canEdit: boolean;
}

export function TransactionCategoryCell({
  transactionId,
  currentCode,
  currentName,
  isOverride,
  categories,
  canEdit,
}: Props) {
  const [code, setCode] = useState(currentCode);
  const [name, setName] = useState(currentName);
  const [override, setOverride] = useState(isOverride);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openEdit() {
    const existing = categories.find((c) => c.code.toUpperCase() === (code ?? "").toUpperCase());
    setDraft(existing?.id ?? "");
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
      const res = await updateTransactionCostCategory(transactionId, draft);
      if (res.error) { setError(res.error); return; }
      setCode(res.categoryCode ?? null);
      setName(res.categoryName ?? null);
      setOverride(true);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[240px]">
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        >
          <option value="">— Select category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
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
    <div className="group/cat flex items-center gap-1">
      {code ? (
        <span className="whitespace-nowrap">
          <span className="font-mono">{code}</span>
          {name && <span className="ml-1 text-[10px]">{name}</span>}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic">— Unmatched —</span>
      )}
      {override && code && (
        <span
          title="Manually overridden — survives AppFolio sync"
          className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400"
        />
      )}
      {canEdit && (
        <div className="ml-auto shrink-0 print:hidden">
          <button
            onClick={openEdit}
            title="Edit cost category"
            className="rounded p-0.5 hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

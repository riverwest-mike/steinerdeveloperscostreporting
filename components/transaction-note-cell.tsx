"use client";

import { useState, useRef, useTransition } from "react";
import { Pencil, Check, X, StickyNote } from "lucide-react";
import { upsertTransactionNote, deleteTransactionNote } from "@/app/actions/transaction-notes";

interface Props {
  appfolioBillId: string;
  initialNote: string | null;
}

export function TransactionNoteCell({ appfolioBillId, initialNote }: Props) {
  const [note, setNote] = useState(initialNote ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function openEdit() {
    setDraft(note);
    setError(null);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save() {
    startTransition(async () => {
      if (draft.trim() === "") {
        // Delete note if cleared
        const res = await deleteTransactionNote(appfolioBillId);
        if (res.error) { setError(res.error); return; }
        setNote("");
      } else {
        const res = await upsertTransactionNote(appfolioBillId, draft);
        if (res.error) { setError(res.error); return; }
        setNote(draft.trim());
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Add a note…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            if (e.key === "Escape") cancel();
          }}
        />
        {error && <p className="text-[10px] text-destructive">{error}</p>}
        <div className="flex gap-1">
          <button
            onClick={save}
            disabled={isPending}
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
    <div className="group/note flex items-start gap-1 min-w-[120px]">
      {note ? (
        <>
          <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
          <span className="text-[11px] text-foreground leading-snug max-w-[180px] line-clamp-3 print:line-clamp-none">
            {note}
          </span>
        </>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic">—</span>
      )}
      <button
        onClick={openEdit}
        title="Edit note"
        className="ml-auto shrink-0 opacity-0 group-hover/note:opacity-100 print:hidden transition-opacity rounded p-0.5 hover:bg-accent"
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

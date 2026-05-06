"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Require a non-empty reason before the confirm button enables. */
  requireReason?: boolean;
}

type ResolveFn = (value: string | null) => void;

interface PendingDialog extends ConfirmOptions {
  resolve: ResolveFn;
}

const ConfirmCtx = createContext<((opts: ConfirmOptions) => Promise<string | null>) | null>(null);

/**
 * Mount once at the root of the dashboard. Provides `useConfirmDestructive()`
 * which returns an async function that opens a Radix-style modal with a typed
 * reason field. Resolves to the reason string when the user confirms, or
 * `null` if they cancel / dismiss.
 *
 *   const confirm = useConfirmDestructive();
 *   const reason = await confirm({ title: "Delete project?", confirmLabel: "Delete" });
 *   if (reason === null) return;          // user cancelled
 *   await deleteProject(id, reason);      // reason may be ""
 */
export function ConfirmDestructiveProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const open = useCallback((opts: ConfirmOptions) => {
    return new Promise<string | null>((resolve) => {
      setReason("");
      setBusy(false);
      setPending({ ...opts, resolve });
    });
  }, []);

  // Auto-focus the textarea when the dialog opens.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [pending]);

  // Lock body scroll while open + Escape to cancel.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        pending.resolve(null);
        setPending(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, busy]);

  function handleCancel() {
    if (!pending || busy) return;
    pending.resolve(null);
    setPending(null);
  }

  function handleConfirm() {
    if (!pending) return;
    if (pending.requireReason && !reason.trim()) return;
    setBusy(true);
    pending.resolve(reason.trim());
    setPending(null);
  }

  const confirmDisabled =
    !!pending && pending.requireReason === true && !reason.trim();

  return (
    <ConfirmCtx.Provider value={open}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-destructive-title"
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-destructive/10 p-2 shrink-0">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 id="confirm-destructive-title" className="text-base font-semibold tracking-tight">
                    {pending.title}
                  </h3>
                  {pending.body && (
                    <div className="mt-1.5 text-sm text-muted-foreground">{pending.body}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-1.5">
              <label htmlFor="confirm-destructive-reason" className="text-xs font-medium text-foreground">
                {pending.reasonLabel ?? "Reason"}{" "}
                {pending.requireReason ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground font-normal">(optional)</span>
                )}
              </label>
              <textarea
                ref={inputRef}
                id="confirm-destructive-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={pending.reasonPlaceholder ?? "Briefly explain why…"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !confirmDisabled) {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter to confirm.
              </p>
            </div>

            <div className="px-6 py-3 bg-muted/30 flex items-center justify-end gap-2 border-t">
              <button
                onClick={handleCancel}
                disabled={busy}
                className="h-9 rounded-md px-4 text-sm font-medium border border-input bg-background hover:bg-accent transition-colors disabled:opacity-50"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmDisabled || busy}
                className="h-9 rounded-md px-4 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirmDestructive() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) {
    throw new Error("useConfirmDestructive must be used inside <ConfirmDestructiveProvider>");
  }
  return ctx;
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Columns3, Check } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  /** If true, column cannot be hidden */
  required?: boolean;
}

interface Props {
  columns: ColumnDef[];
  storageKey: string;
  /** Called whenever the hidden-set changes; use to keep export in sync */
  onHiddenChange?: (hidden: Set<string>) => void;
}

export function ColumnPicker({ columns, storageKey, onHiddenChange }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const arr: string[] = JSON.parse(saved);
        const s = new Set(arr.filter((k) => columns.some((c) => c.key === k && !c.required)));
        setHidden(s);
        onHiddenChange?.(s);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Inject CSS to hide columns by data-col attribute
  const hiddenCss = [...hidden]
    .map((k) => `[data-col="${k}"] { display: none !important; }`)
    .join("\n");

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      onHiddenChange?.(next);
      return next;
    });
  }

  function resetAll() {
    const empty = new Set<string>();
    setHidden(empty);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    onHiddenChange?.(empty);
  }

  const hiddenCount = hidden.size;

  return (
    <>
      {/* Inject hide CSS into the document — only active on screen, not print */}
      {hiddenCount > 0 && (
        <style>{`@media screen { ${hiddenCss} }`}</style>
      )}

      <div ref={ref} className="relative print:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${
            hiddenCount > 0
              ? "border-primary/60 bg-primary/5 text-primary hover:bg-primary/10"
              : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          <Columns3 className="h-4 w-4" />
          Columns{hiddenCount > 0 ? ` (${columns.length - hiddenCount}/${columns.length})` : ""}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border bg-popover shadow-md py-1">
            <div className="flex items-center justify-between px-3 py-1.5 border-b">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Show Columns
              </span>
              {hiddenCount > 0 && (
                <button
                  onClick={resetAll}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Reset all
                </button>
              )}
            </div>
            <div className="py-1 max-h-72 overflow-y-auto">
              {columns.map((col) => {
                const isVisible = !hidden.has(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => !col.required && toggle(col.key)}
                    disabled={col.required}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                      col.required
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-accent cursor-pointer"
                    }`}
                  >
                    <span
                      className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                        isVisible
                          ? "bg-primary border-primary"
                          : "bg-background border-input"
                      }`}
                    >
                      {isVisible && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <span className={isVisible ? "text-foreground" : "text-muted-foreground"}>
                      {col.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

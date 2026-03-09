"use client";

import { useEffect } from "react";
import { Maximize2, X } from "lucide-react";

/** Small expand icon button — place inside a card's header row. */
export function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors flex-shrink-0"
      title="Expand"
      aria-label="Expand card"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Centered modal overlay for expanded dashboard cards.
 * Dismisses on Escape key or clicking the backdrop.
 */
export function ExpandedModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border">
        <div className="flex items-center justify-end px-4 pt-3 pb-0">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}

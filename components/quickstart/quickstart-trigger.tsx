"use client";

import { useEffect, useState } from "react";
import { QuickStartModal } from "./quickstart-modal";

const STORAGE_KEY = "qs_seen_v1";

/**
 * Placed once in the dashboard layout.
 * - Auto-opens the guide the first time a user visits (no localStorage entry).
 * - Also listens for a custom event "open-quickstart" dispatched by the
 *   sidebar link so users can re-open the guide at any time.
 */
export function QuickStartTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Auto-show on first visit
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setIsOpen(true);
      }
    } catch { /* ignore */ }

    // Listen for manual open from sidebar link
    function handleOpen() { setIsOpen(true); }
    window.addEventListener("open-quickstart", handleOpen);
    return () => window.removeEventListener("open-quickstart", handleOpen);
  }, []);

  return (
    <QuickStartModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );
}

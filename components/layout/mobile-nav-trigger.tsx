"use client";

import { Menu } from "lucide-react";

export function MobileNavTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("open-mobile-nav"))}
      className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors print:hidden"
      aria-label="Open navigation menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

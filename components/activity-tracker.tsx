"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Fires a page_view activity log on every route change.
 * Mounted once in DashboardShell — never renders any UI.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "page_view", path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}

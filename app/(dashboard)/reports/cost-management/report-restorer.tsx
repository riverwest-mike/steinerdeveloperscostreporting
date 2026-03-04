"use client";

/**
 * Runs once on mount. If the current URL has no ?projectId, checks localStorage
 * for a previously saved filter and redirects to restore it. This gives the user
 * their last project + date back after navigating away from the report.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportRestorer() {
  const router = useRouter();

  // When the browser restores this page from its back/forward cache (bfcache),
  // React does NOT re-run — the old DOM is shown as-is. Detecting event.persisted
  // and calling router.refresh() forces a server re-fetch so data is current.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("projectId")) return; // already has a filter

    try {
      const raw = localStorage.getItem("pcmr_last_filter");
      if (!raw) return;
      const { projectId, asOf } = JSON.parse(raw) as {
        projectId?: string;
        asOf?: string;
      };
      if (!projectId) return;

      const params = new URLSearchParams();
      params.set("projectId", projectId);
      if (asOf) params.set("asOf", asOf);
      router.replace(`/reports/cost-management?${params.toString()}`);
      // Bust the Next.js client-side router cache so the server component
      // re-fetches fresh data rather than serving a stale cached payload.
      router.refresh();
    } catch {
      // storage or parse error — ignore, show default empty state
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

"use client";

/**
 * Runs once on mount. If the current URL has no project filter, checks localStorage
 * for a previously saved filter and redirects to restore it.
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
    // Already has a filter — don't override
    if (url.searchParams.get("projectIds") || url.searchParams.get("projectId")) return;

    try {
      const raw = localStorage.getItem("pcmr_last_filter");
      if (!raw) return;
      const parsedForDate = JSON.parse(raw) as { savedDate?: string };
      if (parsedForDate.savedDate !== new Date().toISOString().slice(0, 10)) {
        localStorage.removeItem("pcmr_last_filter");
        return;
      }
      const saved = JSON.parse(raw) as {
        projectIds?: string[];
        projectId?: string; // legacy single-project format
        gateId?: string | null;
        asOf?: string;
      };

      // Support both old single-project and new multi-project storage formats
      const ids: string[] = saved.projectIds ?? (saved.projectId ? [saved.projectId] : []);
      if (ids.length === 0) return;

      const params = new URLSearchParams();
      params.set("projectIds", ids.join(","));
      if (saved.gateId) params.set("gateId", saved.gateId);
      if (saved.asOf) params.set("asOf", saved.asOf);
      router.replace(`/reports/cost-management?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore, show default empty state
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

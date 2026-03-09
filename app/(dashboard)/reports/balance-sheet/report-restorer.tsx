"use client";

/**
 * Runs once on mount. If the current URL has no project filter, checks localStorage
 * for a previously saved filter and redirects to restore it.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportRestorer() {
  const router = useRouter();

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("projectIds") || url.searchParams.get("projectId")) return;

    try {
      const raw = localStorage.getItem("bsr_last_filter");
      if (!raw) return;
      const parsedForDate = JSON.parse(raw) as { savedDate?: string };
      if (parsedForDate.savedDate !== new Date().toISOString().slice(0, 10)) {
        localStorage.removeItem("bsr_last_filter");
        return;
      }
      const saved = JSON.parse(raw) as {
        projectIds?: string[];
        projectId?: string; // legacy single-project format
        asOf?: string;
        basis?: string;
      };

      const ids: string[] = saved.projectIds ?? (saved.projectId ? [saved.projectId] : []);
      if (ids.length === 0) return;

      const params = new URLSearchParams();
      params.set("projectIds", ids.join(","));
      if (saved.asOf) params.set("asOf", saved.asOf);
      params.set("basis", saved.basis === "Cash" ? "Cash" : "Accrual");
      router.replace(`/reports/balance-sheet?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

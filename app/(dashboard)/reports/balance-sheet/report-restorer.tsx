"use client";

/**
 * Runs once on mount. If the current URL has no ?projectId, checks localStorage
 * for a previously saved filter and redirects to restore it.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportRestorer() {
  const router = useRouter();

  // Bust bfcache on back/forward navigation so data is always fresh
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) router.refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("projectId")) return;

    try {
      const raw = localStorage.getItem("bsr_last_filter");
      if (!raw) return;
      const { projectId, asOf, basis } = JSON.parse(raw) as {
        projectId?: string;
        asOf?: string;
        basis?: string;
      };
      if (!projectId) return;

      const params = new URLSearchParams();
      params.set("projectId", projectId);
      if (asOf) params.set("asOf", asOf);
      params.set("basis", basis === "Cash" ? "Cash" : "Accrual");
      router.replace(`/reports/balance-sheet?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

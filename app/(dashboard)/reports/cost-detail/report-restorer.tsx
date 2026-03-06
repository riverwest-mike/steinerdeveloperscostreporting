"use client";

/**
 * Runs once on mount. If the current URL has no ?projectId, checks localStorage
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
      const raw = localStorage.getItem("cost_detail_last_filter");
      if (!raw) return;
      const { projectIds, projectId, categoryCode, asOf } = JSON.parse(raw) as {
        projectIds?: string[];
        projectId?: string;
        categoryCode?: string;
        asOf?: string;
      };
      const ids = projectIds ?? (projectId ? [projectId] : []);
      if (ids.length === 0) return;

      const params = new URLSearchParams();
      params.set("projectIds", ids.join(","));
      if (categoryCode) params.set("categoryCode", categoryCode);
      if (asOf) params.set("asOf", asOf);
      router.replace(`/reports/cost-detail?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

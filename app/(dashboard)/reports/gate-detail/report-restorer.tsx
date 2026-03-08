"use client";

/**
 * Runs once on mount. If the current URL has no search params, checks localStorage
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
    if (url.searchParams.toString()) return; // already has filters

    try {
      const raw = localStorage.getItem("gate_detail_last_filter");
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        projectId?: string;
        projectIds?: string[]; // legacy
        gateId?: string;
        categoryCode?: string;
        asOf?: string;
        paymentFilter?: string;
      };

      const params = new URLSearchParams();
      // Support both new single projectId and legacy array
      const pid = saved.projectId ?? (saved.projectIds?.[0]);
      if (pid) params.set("projectId", pid);
      if (saved.gateId) params.set("gateId", saved.gateId);
      if (saved.categoryCode) params.set("categoryCode", saved.categoryCode);
      if (saved.asOf) params.set("asOf", saved.asOf);
      if (saved.paymentFilter) params.set("paymentFilter", saved.paymentFilter);
      if (!params.toString()) return;

      router.replace(`/reports/gate-detail?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

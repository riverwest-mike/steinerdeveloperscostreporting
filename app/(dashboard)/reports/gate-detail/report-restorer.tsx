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
      const { projectIds, gateId, categoryCode, asOf, paymentFilter } = JSON.parse(raw) as {
        projectIds?: string[];
        gateId?: string;
        categoryCode?: string;
        asOf?: string;
        paymentFilter?: string;
      };

      const params = new URLSearchParams();
      if (projectIds && projectIds.length > 0) params.set("projectIds", projectIds.join(","));
      if (gateId) params.set("gateId", gateId);
      if (categoryCode) params.set("categoryCode", categoryCode);
      if (asOf) params.set("asOf", asOf);
      if (paymentFilter) params.set("paymentFilter", paymentFilter);
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

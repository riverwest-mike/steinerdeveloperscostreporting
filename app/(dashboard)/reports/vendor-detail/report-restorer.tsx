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
      const raw = localStorage.getItem("vendor_detail_last_filter");
      if (!raw) return;
      const { projectId, vendorName, categoryCode, asOf } = JSON.parse(raw) as {
        projectId?: string;
        vendorName?: string;
        categoryCode?: string;
        asOf?: string;
      };

      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (vendorName) params.set("vendorName", vendorName);
      if (categoryCode) params.set("categoryCode", categoryCode);
      if (asOf) params.set("asOf", asOf);
      if (!params.toString()) return;

      router.replace(`/reports/vendor-detail?${params.toString()}`);
      router.refresh();
    } catch {
      // storage or parse error — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

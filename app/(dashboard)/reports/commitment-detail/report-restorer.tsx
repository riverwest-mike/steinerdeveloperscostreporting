"use client";

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
    if (url.searchParams.toString()) return;

    try {
      const raw = localStorage.getItem("commitment_detail_last_filter");
      if (!raw) return;
      const parsedForDate = JSON.parse(raw) as { savedDate?: string };
      if (parsedForDate.savedDate !== new Date().toISOString().slice(0, 10)) {
        localStorage.removeItem("commitment_detail_last_filter");
        return;
      }
      const { projectIds, categoryCode, contractStatus, asOf } = JSON.parse(raw) as {
        projectIds?: string[];
        categoryCode?: string;
        contractStatus?: string;
        asOf?: string;
      };

      const params = new URLSearchParams();
      if (projectIds?.length) params.set("projectIds", projectIds.join(","));
      if (categoryCode) params.set("categoryCode", categoryCode);
      if (contractStatus) params.set("contractStatus", contractStatus);
      if (asOf) params.set("asOf", asOf);
      if (!params.toString()) return;

      router.replace(`/reports/commitment-detail?${params.toString()}`);
      router.refresh();
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

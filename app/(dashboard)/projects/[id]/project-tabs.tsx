"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface ProjectTabsProps {
  gateCount: number;
  contractCount: number;
  vendorCount: number;
  documentCount: number;
  drawCount: number;
  overview: React.ReactNode;
  gates: React.ReactNode;
  contracts: React.ReactNode;
  vendors: React.ReactNode;
  documents: React.ReactNode;
  draws: React.ReactNode;
  map: React.ReactNode;
}

export function ProjectTabs({
  gateCount,
  contractCount,
  vendorCount,
  documentCount,
  drawCount,
  overview,
  gates,
  contracts,
  vendors,
  documents,
  draws,
  map,
}: ProjectTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") ?? "overview";
  const [active, setActive] = useState(initialTab);

  // Sync if URL param changes (e.g. back navigation)
  useEffect(() => {
    const tab = searchParams.get("tab") ?? "overview";
    setActive(tab);
  }, [searchParams]);

  function switchTab(tabId: string) {
    setActive(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabId);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }

  const tabs: Tab[] = [
    { id: "overview", label: "Overview" },
    { id: "gates", label: "Gates", count: gateCount },
    { id: "contracts", label: "Contracts", count: contractCount },
    { id: "vendors", label: "Vendors", count: vendorCount },
    { id: "documents", label: "Documents", count: documentCount },
    { id: "draws", label: "Draws", count: drawCount },
    { id: "map", label: "Map" },
  ];

  const contentMap: Record<string, React.ReactNode> = {
    overview,
    gates,
    contracts,
    vendors,
    documents,
    draws,
    map,
  };

  return (
    <div className="mt-5">
      {/* Tab bar */}
      <div className="border-b flex flex-wrap gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              active === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  active === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-5">{contentMap[active]}</div>
    </div>
  );
}

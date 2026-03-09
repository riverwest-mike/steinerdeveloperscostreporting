"use client";

import { useState } from "react";

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
  overview: React.ReactNode;
  gates: React.ReactNode;
  contracts: React.ReactNode;
  vendors: React.ReactNode;
  documents: React.ReactNode;
  map: React.ReactNode;
}

export function ProjectTabs({
  gateCount,
  contractCount,
  vendorCount,
  documentCount,
  overview,
  gates,
  contracts,
  vendors,
  documents,
  map,
}: ProjectTabsProps) {
  const [active, setActive] = useState("overview");

  const tabs: Tab[] = [
    { id: "overview", label: "Overview" },
    { id: "gates", label: "Gates", count: gateCount },
    { id: "contracts", label: "Contracts", count: contractCount },
    { id: "vendors", label: "Vendors", count: vendorCount },
    { id: "documents", label: "Documents", count: documentCount },
    { id: "map", label: "Map" },
  ];

  const contentMap: Record<string, React.ReactNode> = {
    overview,
    gates,
    contracts,
    vendors,
    documents,
    map,
  };

  return (
    <div className="mt-5">
      {/* Tab bar */}
      <div className="border-b flex gap-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
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

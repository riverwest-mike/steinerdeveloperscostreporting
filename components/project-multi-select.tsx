"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  code: string;
}

interface ProjectMultiSelectProps {
  projects: Project[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}

export function ProjectMultiSelect({ projects, selectedIds, onChange }: ProjectMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  const allSelected = selectedIds.size === projects.length && projects.length > 0;
  const noneSelected = selectedIds.size === 0;

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(projects.map((p) => p.id)));
  }

  function clearAll() {
    onChange(new Set());
  }

  // Trigger label
  let triggerLabel: string;
  if (noneSelected) {
    triggerLabel = "Select projects…";
  } else if (allSelected) {
    triggerLabel = `All ${projects.length} projects`;
  } else if (selectedIds.size === 1) {
    const p = projects.find((p) => selectedIds.has(p.id));
    triggerLabel = p ? `${p.code} — ${p.name}` : "1 project";
  } else {
    triggerLabel = `${selectedIds.size} projects selected`;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className={cn(
          "flex h-9 w-full min-w-64 items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors",
          open ? "border-ring ring-1 ring-ring" : "border-input hover:border-ring/50",
          noneSelected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border bg-popover shadow-md">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Select all / clear */}
          {!search && (
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} of {projects.length} selected
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={allSelected}
                  className="text-xs text-primary hover:underline disabled:opacity-40"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={noneSelected}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No projects match.</p>
            ) : (
              filtered.map((p) => {
                const checked = selectedIds.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                      checked ? "bg-primary/5" : "hover:bg-accent/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-3.5 w-3.5 rounded accent-primary"
                    />
                    <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{p.code}</span>
                    <span className="truncate">{p.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

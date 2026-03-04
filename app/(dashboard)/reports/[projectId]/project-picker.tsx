"use client";

import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  code: string;
}

export function ProjectPicker({
  projects,
  currentId,
}: {
  projects: Project[];
  currentId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="project-picker" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Project:
      </label>
      <select
        id="project-picker"
        value={currentId}
        onChange={(e) => router.push(`/reports/${e.target.value}`)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring min-w-[220px]"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

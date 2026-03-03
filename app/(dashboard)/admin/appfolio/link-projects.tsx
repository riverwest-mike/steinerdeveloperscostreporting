"use client";

import { useState, useTransition } from "react";
import { linkAppfolioId } from "@/app/(dashboard)/projects/actions";

type Project = {
  id: string;
  name: string;
  code: string;
};

export function LinkProjects({ projects }: { projects: Project[] }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, ""]))
  );
  const [results, setResults] = useState<Record<string, { success?: boolean; error?: string }>>({});
  const [pending, startTransition] = useTransition();

  if (projects.length === 0) return null;

  function handleSave(projectId: string) {
    startTransition(async () => {
      const result = await linkAppfolioId(projectId, values[projectId] ?? "");
      setResults((prev) => ({
        ...prev,
        [projectId]: result.error ? { error: result.error } : { success: true },
      }));
    });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Link Projects to AppFolio</h3>
      <p className="text-sm text-muted-foreground mb-4">
        The following projects have no AppFolio Property ID. Enter the numeric ID from AppFolio to enable transaction syncing.
      </p>
      <div className="rounded-lg border divide-y">
        {projects.map((project) => {
          const result = results[project.id];
          const saved = result?.success;
          return (
            <div key={project.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">{project.code}</p>
              </div>
              {saved ? (
                <p className="text-sm text-green-600 font-medium">Linked ✓</p>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="AppFolio Property ID"
                    value={values[project.id] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [project.id]: e.target.value }))
                    }
                    className="w-44 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    onClick={() => handleSave(project.id)}
                    disabled={pending || !(values[project.id] ?? "").trim()}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  {result?.error && (
                    <p className="text-xs text-destructive">{result.error}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

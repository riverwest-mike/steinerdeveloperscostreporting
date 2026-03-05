"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectForm } from "../project-form";
import { deleteProject } from "../actions";

interface Project {
  id: string;
  name: string;
  code: string;
  appfolio_property_id: string | null;
  property_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  total_units: number | null;
  total_sf: number | null;
  acquisition_date: string | null;
  expected_completion: string | null;
  status: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function ProjectDetail({ project, isAdmin, appfolioBaseUrl }: { project: Project; isAdmin?: boolean; appfolioBaseUrl?: string }) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm(`Delete project "${project.name}"? This will permanently remove all gates, budgets, and contracts. This cannot be undone.`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteProject(project.id);
      if (result?.error) { setDeleteError(result.error); return; }
      router.push("/projects");
    });
  }

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Edit Project</h2>
        </div>
        <div className="rounded-lg border p-6 bg-card max-w-3xl">
          <ProjectForm editing={project} onCancel={() => setEditing(false)} appfolioBaseUrl={appfolioBaseUrl} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cover image */}
      {project.image_url && (
        <div className="rounded-lg overflow-hidden border" style={{ maxHeight: 240 }}>
          <img
            src={project.image_url}
            alt={project.name}
            className="w-full object-cover"
            style={{ maxHeight: 240 }}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{project.name}</h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_STYLES[project.status] ?? "bg-gray-100 text-gray-800"
              }`}
            >
              {project.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 font-mono text-sm">{project.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Edit Project
          </button>
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete Project"}
            </button>
          )}
        </div>
      </div>
      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <InfoCard label="Property Type" value={project.property_type ?? "—"} />
        <InfoCard
          label="Location"
          value={[project.address, project.city, project.state].filter(Boolean).join(", ") || "—"}
        />
        <InfoCard label="AppFolio Property ID" value={project.appfolio_property_id ?? "—"} mono />
        <InfoCard label="Acquisition Date" value={fmt(project.acquisition_date)} />
        <InfoCard label="Expected Completion" value={fmt(project.expected_completion)} />
        <InfoCard
          label="Scale"
          value={
            project.total_units || project.total_sf
              ? [
                  project.total_units ? `${fmtNum(project.total_units)} units` : null,
                  project.total_sf ? `${fmtNum(project.total_sf)} SF` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "—"
          }
        />
      </div>

      {project.description && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm">{project.description}</p>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

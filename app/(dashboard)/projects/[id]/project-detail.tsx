"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectForm } from "../project-form";
import { deleteProject } from "../actions";

interface PmUser {
  id: string;
  full_name: string;
}

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
  pm_user_id: string | null;
  created_at: string;
}

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectDetail({
  project,
  isAdmin,
  canEdit,
  appfolioBaseUrl,
  pmUsers,
  pmName,
}: {
  project: Project;
  isAdmin?: boolean;
  canEdit?: boolean;
  appfolioBaseUrl?: string;
  pmUsers?: PmUser[];
  pmName?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const router = useRouter();

  void appfolioBaseUrl;

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
      <div className="rounded-lg border p-6 bg-card max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Edit Project</h3>
        </div>
        <ProjectForm
          editing={project}
          onCancel={() => setEditing(false)}
          appfolioBaseUrl={appfolioBaseUrl}
          isAdmin={isAdmin}
          pmUsers={pmUsers}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Action buttons — top right */}
      <div className="flex items-center justify-end gap-2">
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Edit Project
          </button>
        )}
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

      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      {/* Cover image */}
      {project.image_url && (
        <div className="rounded-lg overflow-hidden border" style={{ maxHeight: 200 }}>
          <img
            src={project.image_url}
            alt={project.name}
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
          />
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <InfoCard label="Property Type" value={project.property_type ?? "—"} />
        <InfoCard
          label="Location"
          value={[project.address, project.city, project.state].filter(Boolean).join(", ") || "—"}
        />
        <InfoCard label="AppFolio Property ID" value={project.appfolio_property_id ?? "—"} mono />
        <InfoCard label="Acquisition Date" value={fmt(project.acquisition_date)} />
        <InfoCard label="Expected Completion" value={fmt(project.expected_completion)} />
        <InfoCard label="Project Manager" value={pmName ?? "—"} />
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

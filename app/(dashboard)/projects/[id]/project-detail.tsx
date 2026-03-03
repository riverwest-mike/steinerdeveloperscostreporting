"use client";

import { useState } from "react";
import { ProjectForm } from "../project-form";

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

export function ProjectDetail({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Edit Project</h2>
        </div>
        <div className="rounded-lg border p-6 bg-card max-w-3xl">
          <ProjectForm editing={project} onCancel={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <button
          onClick={() => setEditing(true)}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          Edit Project
        </button>
      </div>

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

      {/* Gates placeholder */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h3 className="font-semibold text-sm">Gates</h3>
        </div>
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Gates will be managed here in the next phase.
        </div>
      </div>

      {/* Contracts placeholder */}
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h3 className="font-semibold text-sm">Contracts</h3>
        </div>
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Contracts will be managed here in the next phase.
        </div>
      </div>
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

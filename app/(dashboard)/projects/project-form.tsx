"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject, updateProject } from "./actions";

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
}

interface ProjectFormProps {
  editing?: Project;
  onCancel?: () => void;
  appfolioBaseUrl?: string;
}

const PROPERTY_TYPES = ["Multifamily", "Commercial", "Mixed-Use", "Land", "Other"];
const STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export function ProjectForm({ editing, onCancel, appfolioBaseUrl }: ProjectFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!editing?.code);
  const [codeValue, setCodeValue] = useState(editing?.code ?? "");
  const router = useRouter();

  function deriveCode(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!codeManuallyEdited) {
      setCodeValue(deriveCode(e.target.value));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (editing) {
          const result = await updateProject(editing.id, fd);
          if (result?.error) { setError(result.error); return; }
          onCancel?.();
        } else {
          const result = await createProject(fd);
          if (result?.error) { setError(result.error); return; }
          router.push("/projects");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1: Name + Code */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="name">
            Project Name <span className="text-destructive">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={editing?.name}
            placeholder="e.g. Riverfront Lofts"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
            onChange={handleNameChange}
          />
          <p className="text-xs text-muted-foreground">
            Must match the Property Name exactly as it appears in AppFolio for transaction syncing to work correctly.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="code">
            Project Code <span className="text-destructive">*</span>
          </label>
          <input
            id="code"
            name="code"
            value={codeValue}
            placeholder="e.g. RFL"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm uppercase"
            onChange={(e) => {
              setCodeManuallyEdited(true);
              setCodeValue(e.target.value.toUpperCase());
            }}
          />
          {!codeManuallyEdited && !editing && (
            <p className="text-xs text-muted-foreground">Auto-filled from name — edit to override.</p>
          )}
        </div>
      </div>

      {/* Row 2: AppFolio ID + Property Type + Status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="appfolio_property_id">
            AppFolio Property ID
          </label>
          <input
            id="appfolio_property_id"
            name="appfolio_property_id"
            defaultValue={editing?.appfolio_property_id ?? ""}
            placeholder="e.g. 12345"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {appfolioBaseUrl ? (
              <>
                Found in the AppFolio property URL:{" "}
                <span className="font-mono">{appfolioBaseUrl}/properties/<strong>12345</strong>/edit</span>
              </>
            ) : (
              <>Numeric ID from the AppFolio property URL — e.g. the number in the browser address bar when viewing the property.</>
            )}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="property_type">
            Property Type
          </label>
          <select
            id="property_type"
            name="property_type"
            defaultValue={editing?.property_type ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">— Select —</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="status">
            Status <span className="text-destructive">*</span>
          </label>
          <select
            id="status"
            name="status"
            required
            defaultValue={editing?.status ?? "active"}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 3: Address + City + State */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium" htmlFor="address">
            Street Address
          </label>
          <input
            id="address"
            name="address"
            defaultValue={editing?.address ?? ""}
            placeholder="e.g. 123 Main St"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="city">
            City
          </label>
          <input
            id="city"
            name="city"
            defaultValue={editing?.city ?? ""}
            placeholder="e.g. Milwaukee"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="state">
            State
          </label>
          <input
            id="state"
            name="state"
            maxLength={2}
            defaultValue={editing?.state ?? ""}
            placeholder="WI"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm uppercase"
          />
        </div>
      </div>

      {/* Row 4: Units + SF + Acquisition Date + Expected Completion */}
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="total_units">
            Total Units
          </label>
          <input
            id="total_units"
            name="total_units"
            type="number"
            min={0}
            defaultValue={editing?.total_units ?? ""}
            placeholder="e.g. 48"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="total_sf">
            Total SF
          </label>
          <input
            id="total_sf"
            name="total_sf"
            type="number"
            min={0}
            defaultValue={editing?.total_sf ?? ""}
            placeholder="e.g. 52000"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="acquisition_date">
            Acquisition Date
          </label>
          <input
            id="acquisition_date"
            name="acquisition_date"
            type="date"
            defaultValue={editing?.acquisition_date ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="expected_completion">
            Expected Completion
          </label>
          <input
            id="expected_completion"
            name="expected_completion"
            type="date"
            defaultValue={editing?.expected_completion ?? ""}
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Row 5: Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="description">
          Notes / Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={editing?.description ?? ""}
          placeholder="Optional project notes…"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm resize-none"
        />
      </div>

      {/* Row 6: Cover Image */}
      <div className="space-y-1">
        <label className="text-xs font-medium" htmlFor="image">
          Cover Image
        </label>
        {editing?.image_url && (
          <div className="mb-2">
            <img
              src={editing.image_url}
              alt="Current cover"
              className="h-24 w-40 object-cover rounded border"
            />
            <p className="text-xs text-muted-foreground mt-1">Current image — upload a new file to replace it.</p>
          </div>
        )}
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? "Saving…" : editing ? "Save Changes" : "Create Project"}
        </button>
        <button
          type="button"
          onClick={() => onCancel ? onCancel() : router.push("/projects")}
          className="rounded border px-4 py-1.5 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

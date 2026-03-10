"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameVendor } from "./actions";

interface VendorProfileEditProps {
  vendorName: string;
}

export function VendorProfileEdit({ vendorName }: VendorProfileEditProps) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(vendorName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await renameVendor(vendorName, newName);
      if (result.error) { setError(result.error); return; }
      setEditing(false);
      if (result.newName && result.newName !== vendorName) {
        router.replace(`/vendors/${encodeURIComponent(result.newName)}`);
      }
    });
  }

  if (editing) {
    return (
      <div className="rounded-lg border p-4 bg-muted/20 max-w-md mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Edit Vendor Name</p>
        <div className="space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(null); }}
            autoFocus
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !newName.trim()}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setNewName(vendorName); setError(null); }}
              className="rounded border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors shrink-0"
    >
      Edit Profile
    </button>
  );
}

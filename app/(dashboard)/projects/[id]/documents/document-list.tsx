"use client";

import { useState, useTransition, useRef } from "react";
import { uploadDocument, deleteDocument, getSignedDownloadUrl, updateDocumentMeta } from "./actions";

interface Document {
  id: string;
  name: string;
  url: string;          // storage path
  category: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
}

interface DocumentListProps {
  projectId: string;
  documents: Document[];
  canEdit: boolean;
  isAdmin: boolean;
}

const CATEGORIES = ["Legal", "Financial", "Design", "Other"] as const;

const CATEGORY_STYLES: Record<string, string> = {
  Legal:     "bg-purple-100 text-purple-800",
  Financial: "bg-blue-100 text-blue-800",
  Design:    "bg-amber-100 text-amber-800",
  Other:     "bg-gray-100 text-gray-600",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["ppt", "pptx"].includes(ext)) return "📑";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️";
  if (["zip", "rar"].includes(ext)) return "🗜️";
  return "📎";
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ projectId, documents, canEdit, isAdmin }: DocumentListProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, startSave] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = documents.filter((d) => {
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
    if (search.trim() && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null;
    if (!file || file.size === 0) { setUploadError("Please select a file"); return; }
    const form = e.currentTarget;
    startUpload(async () => {
      const result = await uploadDocument(projectId, fd);
      if (result.error) { setUploadError(result.error); return; }
      form.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  async function handleDownload(doc: Document) {
    setDownloadingId(doc.id);
    try {
      const result = await getSignedDownloadUrl(doc.url);
      if (result.error || !result.url) {
        setActionError(result.error ?? "Failed to generate download link");
        return;
      }
      // Open in new tab — browser handles inline view for PDFs, image downloads for others
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  function startEdit(doc: Document) {
    setEditingId(doc.id);
    setEditName(doc.name);
    setEditCategory(doc.category ?? "");
    setEditNotes(doc.notes ?? "");
  }

  function handleSaveEdit(docId: string) {
    startSave(async () => {
      const result = await updateDocumentMeta(
        docId, projectId, editName, editCategory || null, editNotes || null
      );
      if (result.error) { setActionError(result.error); return; }
      setEditingId(null);
    });
  }

  function handleDelete(doc: Document) {
    if (!confirm(`Permanently delete "${doc.name}"? This cannot be undone.`)) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteDocument(doc.id, doc.url, projectId);
      if (result.error) setActionError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      {/* Upload form */}
      {canEdit && (
        <form ref={formRef} onSubmit={handleUpload} className="rounded-lg border p-4 bg-muted/20 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload Document</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* File picker */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">
                File <span className="text-destructive">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip"
                className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground">
                PDF, Word, Excel, PowerPoint, images, CSV, ZIP — max 50 MB
              </p>
            </div>

            {/* Display name */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Display Name</label>
              <input
                type="text"
                name="name"
                placeholder="Leave blank to use filename"
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Category</label>
              <select
                name="category"
                defaultValue=""
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">Notes (optional)</label>
              <input
                type="text"
                name="notes"
                placeholder="Brief description or version note"
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isUploading}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {isUploading ? "Uploading…" : "Upload"}
            </button>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </div>
        </form>
      )}

      {/* Filter bar */}
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border overflow-hidden text-xs font-medium">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1.5 transition-colors ${categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              All ({documents.length})
            </button>
            {CATEGORIES.filter((c) => documents.some((d) => d.category === c)).map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 transition-colors ${categoryFilter === c ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {c} ({documents.filter((d) => d.category === c).length})
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="h-8 min-w-[200px] rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {actionError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{actionError}</p>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No documents yet.{canEdit ? " Upload the first one above." : ""}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No documents match your filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-medium">Document</th>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-left font-medium">Notes</th>
                <th className="px-4 py-2.5 text-left font-medium">Uploaded</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    {editingId === doc.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-xs"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileIcon(doc.url)}</span>
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="font-medium text-left hover:text-primary hover:underline underline-offset-2 transition-colors disabled:opacity-50"
                        >
                          {doc.name}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === doc.id ? (
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— None —</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : doc.category ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[doc.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {doc.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                    {editingId === doc.id ? (
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-full"
                      />
                    ) : (
                      <span className="line-clamp-2">{doc.notes || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(doc.created_at)}
                    {doc.created_by_name && (
                      <span className="block text-[10px]">{doc.created_by_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === doc.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSaveEdit(doc.id)}
                          disabled={isSaving}
                          className="text-xs rounded bg-primary px-2.5 py-1 text-primary-foreground disabled:opacity-50"
                        >
                          {isSaving ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="text-xs text-primary hover:underline underline-offset-2 disabled:opacity-50"
                        >
                          {downloadingId === doc.id ? "…" : "Download"}
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => startEdit(doc)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={isPending}
                            className="text-xs text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {documents.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {documents.length} document{documents.length !== 1 ? "s" : ""}.
          {" "}Download links expire after 1 hour.
        </p>
      )}
    </div>
  );
}

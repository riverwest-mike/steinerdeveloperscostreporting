"use client";

import { useState, useTransition, useRef } from "react";
import {
  uploadVendorDocument,
  deleteVendorDocument,
  getVendorDocumentSignedUrl,
} from "./actions";

export interface VendorDoc {
  id: string;
  vendor_name: string;
  project_id: string | null;
  document_type: string;
  display_name: string;
  storage_path: string;
  // COI
  insurer_name: string | null;
  policy_number: string | null;
  coverage_type: string | null;
  per_occurrence_limit: number | null;
  aggregate_limit: number | null;
  additional_insured: boolean | null;
  waiver_of_subrogation: boolean | null;
  // Lien Waiver
  waiver_type: string | null;
  waiver_amount: number | null;
  through_date: string | null;
  // Shared
  effective_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
}

interface VendorDocumentsProps {
  vendorName: string;
  documents: VendorDoc[];
  projects: Project[];
  canEdit: boolean;
  isAdmin: boolean;
}

const DOC_TYPES = ["COI", "Lien Waiver", "Other"] as const;

const TYPE_STYLES: Record<string, string> = {
  COI: "bg-blue-100 text-blue-800",
  "Lien Waiver": "bg-purple-100 text-purple-800",
  Other: "bg-gray-100 text-gray-600",
};

const WAIVER_TYPES = [
  "Conditional Partial",
  "Conditional Final",
  "Unconditional Partial",
  "Unconditional Final",
] as const;

const COVERAGE_TYPES = [
  "General Liability",
  "Workers Compensation",
  "Commercial Auto",
  "Umbrella / Excess",
  "Professional Liability",
  "Builders Risk",
  "Other",
] as const;

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const exp = new Date(date + "T00:00:00");
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  return exp <= in60;
}

function isExpired(date: string | null): boolean {
  if (!date) return false;
  return new Date(date + "T00:00:00") < new Date();
}

function fileIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️";
  return "📎";
}

export function VendorDocuments({
  vendorName,
  documents,
  projects,
  canEdit,
  isAdmin,
}: VendorDocumentsProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState<string>("COI");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = filterType === "all"
    ? documents
    : documents.filter((d) => d.document_type === filterType);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null;
    if (!file || file.size === 0) { setUploadError("Please select a file"); return; }
    fd.set("vendorName", vendorName);
    const form = e.currentTarget;
    startUpload(async () => {
      const result = await uploadVendorDocument(fd);
      if (result.error) { setUploadError(result.error); return; }
      form.reset();
      setDocType("COI");
      setShowUpload(false);
    });
  }

  async function handleDownload(doc: VendorDoc) {
    setDownloadingId(doc.id);
    try {
      const result = await getVendorDocumentSignedUrl(doc.storage_path);
      if (result.error || !result.url) {
        setActionError(result.error ?? "Failed to generate download link");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  function handleDelete(doc: VendorDoc) {
    if (!confirm(`Permanently delete "${doc.display_name}"? This cannot be undone.`)) return;
    setActionError(null);
    startTransition(async () => {
      const result = await deleteVendorDocument(doc.id, doc.storage_path, vendorName);
      if (result.error) setActionError(result.error);
    });
  }

  const typeCounts = DOC_TYPES.reduce((acc, t) => {
    acc[t] = documents.filter((d) => d.document_type === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-xs font-medium">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 transition-colors ${filterType === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            All ({documents.length})
          </button>
          {DOC_TYPES.filter((t) => typeCounts[t] > 0).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 transition-colors ${filterType === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {t} ({typeCounts[t]})
            </button>
          ))}
        </div>
        {canEdit && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {showUpload ? "Cancel" : "+ Upload Document"}
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUpload && canEdit && (
        <form
          ref={formRef}
          onSubmit={handleUpload}
          className="rounded-lg border p-5 bg-muted/20 space-y-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Upload Compliance Document
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Document type */}
            <div className="space-y-1">
              <label className="text-xs font-medium">
                Document Type <span className="text-destructive">*</span>
              </label>
              <select
                name="documentType"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                required
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Display name */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Display Name</label>
              <input
                type="text"
                name="displayName"
                placeholder="Leave blank to use filename"
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Project (optional scope) */}
            {projects.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Project (optional)</label>
                <select
                  name="projectId"
                  defaultValue=""
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground">PDF, Word, or image — max 50 MB</p>
            </div>
          </div>

          {/* ── COI-specific fields ──────────────────────── */}
          {docType === "COI" && (
            <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                Certificate of Insurance Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Insurance Company</label>
                  <input
                    type="text"
                    name="insurerName"
                    placeholder="e.g. Travelers, Zurich"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Policy Number</label>
                  <input
                    type="text"
                    name="policyNumber"
                    placeholder="e.g. GL-1234567"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Coverage Type</label>
                  <select
                    name="coverageType"
                    defaultValue=""
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— Select —</option>
                    {COVERAGE_TYPES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Per Occurrence Limit ($)</label>
                  <input
                    type="number"
                    name="perOccurrenceLimit"
                    placeholder="e.g. 1000000"
                    min={0}
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">General Aggregate Limit ($)</label>
                  <input
                    type="number"
                    name="aggregateLimit"
                    placeholder="e.g. 2000000"
                    min={0}
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input
                    type="date"
                    name="effectiveDate"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Expiration Date</label>
                  <input
                    type="date"
                    name="expirationDate"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-6 sm:col-span-2 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="additionalInsured"
                      value="true"
                      className="rounded"
                    />
                    Additional Insured
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="waiverOfSubrogation"
                      value="true"
                      className="rounded"
                    />
                    Waiver of Subrogation
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── Lien Waiver-specific fields ──────────────── */}
          {docType === "Lien Waiver" && (
            <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-4">
              <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                Lien Waiver Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Type</label>
                  <select
                    name="waiverType"
                    defaultValue=""
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— Select —</option>
                    {WAIVER_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Amount ($)</label>
                  <input
                    type="number"
                    name="waiverAmount"
                    placeholder="e.g. 50000"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Through Date</label>
                  <input
                    type="date"
                    name="throughDate"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input
                    type="date"
                    name="effectiveDate"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Other — just dates */}
          {docType === "Other" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective Date</label>
                <input
                  type="date"
                  name="effectiveDate"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Expiration Date</label>
                <input
                  type="date"
                  name="expirationDate"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Notes (optional)</label>
            <input
              type="text"
              name="notes"
              placeholder="Brief description or version note"
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
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

      {actionError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{actionError}</p>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No compliance documents yet.{canEdit ? " Click \"+ Upload Document\" to add one." : ""}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No documents match the selected filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-2.5 text-left font-medium">Document</th>
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Details</th>
                <th className="px-4 py-2.5 text-left font-medium">Expires</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((doc) => {
                const expired = isExpired(doc.expiration_date);
                const expiringSoon = !expired && isExpiringSoon(doc.expiration_date);
                return (
                  <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileIcon(doc.storage_path)}</span>
                        <div>
                          <p className="font-medium leading-tight">{doc.display_name}</p>
                          {doc.notes && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{doc.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLES[doc.document_type] ?? "bg-gray-100 text-gray-600"}`}>
                        {doc.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
                      {doc.document_type === "COI" && (
                        <div className="space-y-0.5">
                          {doc.insurer_name && <p>{doc.insurer_name}</p>}
                          {doc.coverage_type && <p>{doc.coverage_type}</p>}
                          {doc.policy_number && <p className="font-mono text-[10px]">{doc.policy_number}</p>}
                          {doc.per_occurrence_limit && (
                            <p>{usd(doc.per_occurrence_limit)} / occ</p>
                          )}
                          {doc.aggregate_limit && (
                            <p>{usd(doc.aggregate_limit)} agg</p>
                          )}
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {doc.additional_insured && (
                              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">Add&apos;l Insured</span>
                            )}
                            {doc.waiver_of_subrogation && (
                              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">Waiver of Subrog.</span>
                            )}
                          </div>
                        </div>
                      )}
                      {doc.document_type === "Lien Waiver" && (
                        <div className="space-y-0.5">
                          {doc.waiver_type && <p>{doc.waiver_type}</p>}
                          {doc.waiver_amount && <p>{usd(doc.waiver_amount)}</p>}
                          {doc.through_date && <p>Through {fmtDate(doc.through_date)}</p>}
                        </div>
                      )}
                      {doc.effective_date && (
                        <p className="mt-0.5">Eff. {fmtDate(doc.effective_date)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {doc.expiration_date ? (
                        <span
                          className={`inline-flex flex-col text-xs ${
                            expired
                              ? "text-destructive font-medium"
                              : expiringSoon
                              ? "text-amber-700 font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          {fmtDate(doc.expiration_date)}
                          {expired && (
                            <span className="text-[10px] font-semibold">EXPIRED</span>
                          )}
                          {expiringSoon && !expired && (
                            <span className="text-[10px] font-semibold">Expires soon</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="text-xs text-primary hover:underline underline-offset-2 disabled:opacity-50"
                        >
                          {downloadingId === doc.id ? "…" : "Download"}
                        </button>
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
                    </td>
                  </tr>
                );
              })}
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

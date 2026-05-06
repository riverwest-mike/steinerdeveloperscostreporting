"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  uploadVendorDocument,
  updateVendorDocument,
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
  const now = new Date();
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  return exp > now && exp <= in60;
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

function canExtractFromFile(file: File | null): boolean {
  if (!file) return false;
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

const INPUT_CLS =
  "w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

const EMPTY_COI_FIELDS = {
  insurerName: "",
  policyNumber: "",
  coverageType: "",
  perOccurrenceLimit: "",
  aggregateLimit: "",
  effectiveDate: "",
  expirationDate: "",
  additionalInsured: false,
  waiverOfSubrogation: false,
};

type EditFields = {
  displayName: string;
  notes: string;
  insurerName: string;
  policyNumber: string;
  coverageType: string;
  perOccurrenceLimit: string;
  aggregateLimit: string;
  effectiveDate: string;
  expirationDate: string;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  waiverType: string;
  waiverAmount: string;
  throughDate: string;
};

const EMPTY_EDIT_FIELDS: EditFields = {
  displayName: "",
  notes: "",
  insurerName: "",
  policyNumber: "",
  coverageType: "",
  perOccurrenceLimit: "",
  aggregateLimit: "",
  effectiveDate: "",
  expirationDate: "",
  additionalInsured: false,
  waiverOfSubrogation: false,
  waiverType: "",
  waiverAmount: "",
  throughDate: "",
};

export function VendorDocuments({
  vendorName,
  documents,
  projects,
  canEdit,
  isAdmin,
}: VendorDocumentsProps) {
  // ── Filter ────────────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<string>("all");

  // ── Upload form ───────────────────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("COI");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI extraction (upload form only) ─────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [coiFields, setCoiFields] = useState({ ...EMPTY_COI_FIELDS });
  const [extractedSuccessfully, setExtractedSuccessfully] = useState(false);

  // ── Edit form ─────────────────────────────────────────────────────────────
  const [editingDoc, setEditingDoc] = useState<VendorDoc | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ ...EMPTY_EDIT_FIELDS });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  // ── Shared actions ────────────────────────────────────────────────────────
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered =
    filterType === "all" ? documents : documents.filter((d) => d.document_type === filterType);

  const typeCounts = DOC_TYPES.reduce(
    (acc, t) => {
      acc[t] = documents.filter((d) => d.document_type === t).length;
      return acc;
    },
    {} as Record<string, number>
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function resetUploadState() {
    setSelectedFile(null);
    setExtractError(null);
    setUploadError(null);
    setExtractedSuccessfully(false);
    setCoiFields({ ...EMPTY_COI_FIELDS });
    setUploadDocType("COI");
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null;
    if (!file || file.size === 0) {
      setUploadError("Please select a file");
      return;
    }
    fd.set("vendorName", vendorName);
    const form = e.currentTarget;
    startUpload(async () => {
      const result = await uploadVendorDocument(fd);
      if (result.error) {
        setUploadError(result.error);
        return;
      }
      form.reset();
      resetUploadState();
      setShowUpload(false);
    });
  }

  async function handleExtractWithAI() {
    if (!selectedFile) return;
    setIsExtracting(true);
    setExtractError(null);
    setExtractedSuccessfully(false);
    try {
      const fd = new FormData();
      fd.set("file", selectedFile);
      const resp = await fetch("/api/extract-document", { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok || json.error) {
        setExtractError(json.error ?? "Extraction failed");
        return;
      }
      const d = json.data;
      setCoiFields({
        insurerName: d.insurer_name ?? "",
        policyNumber: d.policy_number ?? "",
        coverageType: (COVERAGE_TYPES as readonly string[]).includes(d.coverage_type)
          ? d.coverage_type
          : "",
        perOccurrenceLimit: d.per_occurrence_limit != null ? String(d.per_occurrence_limit) : "",
        aggregateLimit: d.aggregate_limit != null ? String(d.aggregate_limit) : "",
        effectiveDate: d.effective_date ?? "",
        expirationDate: d.expiration_date ?? "",
        additionalInsured: !!d.additional_insured,
        waiverOfSubrogation: !!d.waiver_of_subrogation,
      });
      setExtractedSuccessfully(true);
    } catch {
      setExtractError("Network error during extraction");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleEditOpen(doc: VendorDoc) {
    setEditingDoc(doc);
    setShowUpload(false);
    setEditError(null);
    setEditFields({
      displayName: doc.display_name,
      notes: doc.notes ?? "",
      insurerName: doc.insurer_name ?? "",
      policyNumber: doc.policy_number ?? "",
      coverageType: doc.coverage_type ?? "",
      perOccurrenceLimit: doc.per_occurrence_limit?.toString() ?? "",
      aggregateLimit: doc.aggregate_limit?.toString() ?? "",
      effectiveDate: doc.effective_date ?? "",
      expirationDate: doc.expiration_date ?? "",
      additionalInsured: doc.additional_insured ?? false,
      waiverOfSubrogation: doc.waiver_of_subrogation ?? false,
      waiverType: doc.waiver_type ?? "",
      waiverAmount: doc.waiver_amount?.toString() ?? "",
      throughDate: doc.through_date ?? "",
    });
  }

  function handleEditSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingDoc) return;
    setEditError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("documentType", editingDoc.document_type);
    startSave(async () => {
      const result = await updateVendorDocument(editingDoc.id, vendorName, fd);
      if (result.error) {
        setEditError(result.error);
        return;
      }
      setEditingDoc(null);
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

  // ── Render ────────────────────────────────────────────────────────────────

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
            onClick={() => {
              if (showUpload) {
                resetUploadState();
                setShowUpload(false);
              } else {
                setEditingDoc(null);
                setShowUpload(true);
              }
            }}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {showUpload ? "Cancel" : "+ Upload Document"}
          </button>
        )}
      </div>

      {/* ── Upload form ────────────────────────────────────────────────────── */}
      {showUpload && canEdit && (
        <form
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
                value={uploadDocType}
                onChange={(e) => {
                  setUploadDocType(e.target.value);
                  setExtractError(null);
                  setExtractedSuccessfully(false);
                }}
                required
                className={INPUT_CLS}
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
                className={INPUT_CLS}
              />
            </div>

            {/* Project (optional scope) */}
            {projects.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Project (optional)</label>
                <select name="projectId" defaultValue="" className={INPUT_CLS}>
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
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  setExtractedSuccessfully(false);
                  setExtractError(null);
                }}
                className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground">PDF, Word, or image — max 50 MB</p>

              {/* AI Extract button — only for COI + PDF/image */}
              {uploadDocType === "COI" && canExtractFromFile(selectedFile) && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={handleExtractWithAI}
                    disabled={isExtracting}
                    className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>✨ Extract with AI</>
                    )}
                  </button>
                  {extractError && <p className="text-xs text-destructive">{extractError}</p>}
                  {extractedSuccessfully && !extractError && (
                    <p className="text-xs text-green-700 font-medium">✓ Fields extracted — review below</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── COI fields ──────────────────────────────────────────────────── */}
          {uploadDocType === "COI" && (
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
                    value={coiFields.insurerName}
                    onChange={(e) => setCoiFields((f) => ({ ...f, insurerName: e.target.value }))}
                    placeholder="e.g. Travelers, Zurich"
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Policy Number</label>
                  <input
                    type="text"
                    name="policyNumber"
                    value={coiFields.policyNumber}
                    onChange={(e) => setCoiFields((f) => ({ ...f, policyNumber: e.target.value }))}
                    placeholder="e.g. GL-1234567"
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Coverage Type</label>
                  <select
                    name="coverageType"
                    value={coiFields.coverageType}
                    onChange={(e) => setCoiFields((f) => ({ ...f, coverageType: e.target.value }))}
                    className={INPUT_CLS}
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
                    value={coiFields.perOccurrenceLimit}
                    onChange={(e) => setCoiFields((f) => ({ ...f, perOccurrenceLimit: e.target.value }))}
                    placeholder="e.g. 1000000"
                    min={0}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">General Aggregate Limit ($)</label>
                  <input
                    type="number"
                    name="aggregateLimit"
                    value={coiFields.aggregateLimit}
                    onChange={(e) => setCoiFields((f) => ({ ...f, aggregateLimit: e.target.value }))}
                    placeholder="e.g. 2000000"
                    min={0}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input
                    type="date"
                    name="effectiveDate"
                    value={coiFields.effectiveDate}
                    onChange={(e) => setCoiFields((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Expiration Date</label>
                  <input
                    type="date"
                    name="expirationDate"
                    value={coiFields.expirationDate}
                    onChange={(e) => setCoiFields((f) => ({ ...f, expirationDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="flex items-center gap-6 sm:col-span-2 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="additionalInsured"
                      value="true"
                      checked={coiFields.additionalInsured}
                      onChange={(e) => setCoiFields((f) => ({ ...f, additionalInsured: e.target.checked }))}
                      className="rounded"
                    />
                    Additional Insured
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="waiverOfSubrogation"
                      value="true"
                      checked={coiFields.waiverOfSubrogation}
                      onChange={(e) => setCoiFields((f) => ({ ...f, waiverOfSubrogation: e.target.checked }))}
                      className="rounded"
                    />
                    Waiver of Subrogation
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── Lien Waiver fields ───────────────────────────────────────────── */}
          {uploadDocType === "Lien Waiver" && (
            <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-4">
              <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                Lien Waiver Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Type</label>
                  <select name="waiverType" defaultValue="" className={INPUT_CLS}>
                    <option value="">— Select —</option>
                    {WAIVER_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Amount ($)</label>
                  <input type="number" name="waiverAmount" placeholder="e.g. 50000" min={0} step="0.01" className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Through Date</label>
                  <input type="date" name="throughDate" className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input type="date" name="effectiveDate" className={INPUT_CLS} />
                </div>
              </div>
            </div>
          )}

          {/* ── Other — just dates ───────────────────────────────────────────── */}
          {uploadDocType === "Other" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective Date</label>
                <input type="date" name="effectiveDate" className={INPUT_CLS} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Expiration Date</label>
                <input type="date" name="expirationDate" className={INPUT_CLS} />
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
              className={INPUT_CLS}
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

      {/* ── Edit form ─────────────────────────────────────────────────────── */}
      {editingDoc && canEdit && (
        <form
          onSubmit={handleEditSave}
          className="rounded-lg border border-amber-300 p-5 bg-amber-50/30 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Edit: {editingDoc.display_name}
            </p>
            <button
              type="button"
              onClick={() => setEditingDoc(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕ Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Display Name</label>
              <input
                type="text"
                name="displayName"
                value={editFields.displayName}
                onChange={(e) => setEditFields((f) => ({ ...f, displayName: e.target.value }))}
                className={INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notes</label>
              <input
                type="text"
                name="notes"
                value={editFields.notes}
                onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* COI edit fields */}
          {editingDoc.document_type === "COI" && (
            <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                Certificate of Insurance Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Insurance Company</label>
                  <input type="text" name="insurerName" value={editFields.insurerName} onChange={(e) => setEditFields((f) => ({ ...f, insurerName: e.target.value }))} placeholder="e.g. Travelers, Zurich" className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Policy Number</label>
                  <input type="text" name="policyNumber" value={editFields.policyNumber} onChange={(e) => setEditFields((f) => ({ ...f, policyNumber: e.target.value }))} placeholder="e.g. GL-1234567" className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Coverage Type</label>
                  <select name="coverageType" value={editFields.coverageType} onChange={(e) => setEditFields((f) => ({ ...f, coverageType: e.target.value }))} className={INPUT_CLS}>
                    <option value="">— Select —</option>
                    {COVERAGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Per Occurrence Limit ($)</label>
                  <input type="number" name="perOccurrenceLimit" value={editFields.perOccurrenceLimit} onChange={(e) => setEditFields((f) => ({ ...f, perOccurrenceLimit: e.target.value }))} min={0} className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">General Aggregate Limit ($)</label>
                  <input type="number" name="aggregateLimit" value={editFields.aggregateLimit} onChange={(e) => setEditFields((f) => ({ ...f, aggregateLimit: e.target.value }))} min={0} className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input type="date" name="effectiveDate" value={editFields.effectiveDate} onChange={(e) => setEditFields((f) => ({ ...f, effectiveDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Expiration Date</label>
                  <input type="date" name="expirationDate" value={editFields.expirationDate} onChange={(e) => setEditFields((f) => ({ ...f, expirationDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div className="flex items-center gap-6 sm:col-span-2 pt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="additionalInsured" value="true" checked={editFields.additionalInsured} onChange={(e) => setEditFields((f) => ({ ...f, additionalInsured: e.target.checked }))} className="rounded" />
                    Additional Insured
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="waiverOfSubrogation" value="true" checked={editFields.waiverOfSubrogation} onChange={(e) => setEditFields((f) => ({ ...f, waiverOfSubrogation: e.target.checked }))} className="rounded" />
                    Waiver of Subrogation
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Lien Waiver edit fields */}
          {editingDoc.document_type === "Lien Waiver" && (
            <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-4">
              <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                Lien Waiver Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Type</label>
                  <select name="waiverType" value={editFields.waiverType} onChange={(e) => setEditFields((f) => ({ ...f, waiverType: e.target.value }))} className={INPUT_CLS}>
                    <option value="">— Select —</option>
                    {WAIVER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Waiver Amount ($)</label>
                  <input type="number" name="waiverAmount" value={editFields.waiverAmount} onChange={(e) => setEditFields((f) => ({ ...f, waiverAmount: e.target.value }))} min={0} step="0.01" className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Through Date</label>
                  <input type="date" name="throughDate" value={editFields.throughDate} onChange={(e) => setEditFields((f) => ({ ...f, throughDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Effective Date</label>
                  <input type="date" name="effectiveDate" value={editFields.effectiveDate} onChange={(e) => setEditFields((f) => ({ ...f, effectiveDate: e.target.value }))} className={INPUT_CLS} />
                </div>
              </div>
            </div>
          )}

          {/* Other edit fields */}
          {editingDoc.document_type === "Other" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective Date</label>
                <input type="date" name="effectiveDate" value={editFields.effectiveDate} onChange={(e) => setEditFields((f) => ({ ...f, effectiveDate: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Expiration Date</label>
                <input type="date" name="expirationDate" value={editFields.expirationDate} onChange={(e) => setEditFields((f) => ({ ...f, expirationDate: e.target.value }))} className={INPUT_CLS} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditingDoc(null)}
              disabled={isSaving}
              className="rounded border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
        </form>
      )}

      {actionError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{actionError}</p>
      )}

      {/* ── Document list ──────────────────────────────────────────────────── */}
      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No compliance documents yet.{canEdit ? ' Click "+ Upload Document" to add one.' : ""}
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
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((doc) => {
                const expired = isExpired(doc.expiration_date);
                const expiringSoon = !expired && isExpiringSoon(doc.expiration_date);
                const isActiveEdit = editingDoc?.id === doc.id;

                // Status badge
                let statusBadge: React.ReactNode;
                if (!doc.expiration_date) {
                  statusBadge = (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      No Expiry
                    </span>
                  );
                } else if (expired) {
                  statusBadge = (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Expired
                    </span>
                  );
                } else if (expiringSoon) {
                  statusBadge = (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Expiring Soon
                    </span>
                  );
                } else {
                  statusBadge = (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      Active
                    </span>
                  );
                }

                const hasCoiDetails =
                  doc.insurer_name ||
                  doc.coverage_type ||
                  doc.policy_number ||
                  doc.per_occurrence_limit ||
                  doc.aggregate_limit;

                const hasLienDetails =
                  doc.waiver_type || doc.waiver_amount || doc.through_date;

                return (
                  <tr
                    key={doc.id}
                    className={`transition-colors ${isActiveEdit ? "bg-amber-50/40" : "hover:bg-muted/30"}`}
                  >
                    {/* Document name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileIcon(doc.storage_path)}</span>
                        <div>
                          <p className="font-medium leading-tight">{doc.display_name}</p>
                          {doc.notes && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {doc.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLES[doc.document_type] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {doc.document_type}
                      </span>
                    </td>

                    {/* Details — labeled */}
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
                      {doc.document_type === "COI" ? (
                        <div className="space-y-0.5">
                          {hasCoiDetails ? (
                            <>
                              {doc.insurer_name && (
                                <p>
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Insurer </span>
                                  {doc.insurer_name}
                                </p>
                              )}
                              {doc.coverage_type && (
                                <p>
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Coverage </span>
                                  {doc.coverage_type}
                                </p>
                              )}
                              {doc.policy_number && (
                                <p>
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Policy </span>
                                  <span className="font-mono text-[10px]">{doc.policy_number}</span>
                                </p>
                              )}
                              {(doc.per_occurrence_limit || doc.aggregate_limit) && (
                                <p className="tabular-nums">
                                  {doc.per_occurrence_limit && (
                                    <>
                                      <span className="text-[9px] uppercase tracking-wide opacity-60">Occ </span>
                                      {usd(doc.per_occurrence_limit)}
                                    </>
                                  )}
                                  {doc.per_occurrence_limit && doc.aggregate_limit && (
                                    <span className="opacity-40 mx-1">·</span>
                                  )}
                                  {doc.aggregate_limit && (
                                    <>
                                      <span className="text-[9px] uppercase tracking-wide opacity-60">Agg </span>
                                      {usd(doc.aggregate_limit)}
                                    </>
                                  )}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] italic opacity-40">
                              {canEdit ? "No details — click Edit" : "No details entered"}
                            </p>
                          )}
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {doc.additional_insured && (
                              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">
                                Add&apos;l Insured
                              </span>
                            )}
                            {doc.waiver_of_subrogation && (
                              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">
                                Waiver of Subrog.
                              </span>
                            )}
                          </div>
                        </div>
                      ) : doc.document_type === "Lien Waiver" ? (
                        <div className="space-y-0.5">
                          {hasLienDetails ? (
                            <>
                              {doc.waiver_type && (
                                <p>
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Type </span>
                                  {doc.waiver_type}
                                </p>
                              )}
                              {doc.waiver_amount != null && (
                                <p className="tabular-nums">
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Amount </span>
                                  {usd(doc.waiver_amount)}
                                </p>
                              )}
                              {doc.through_date && (
                                <p>
                                  <span className="text-[9px] uppercase tracking-wide opacity-60">Through </span>
                                  {fmtDate(doc.through_date)}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] italic opacity-40">
                              {canEdit ? "No details — click Edit" : "No details entered"}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] italic opacity-30">—</span>
                      )}
                      {doc.effective_date && (
                        <p className="mt-0.5 text-[11px]">
                          <span className="text-[9px] uppercase tracking-wide opacity-60">Eff </span>
                          {fmtDate(doc.effective_date)}
                        </p>
                      )}
                    </td>

                    {/* Status + expiry date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="space-y-1">
                        {statusBadge}
                        {doc.expiration_date && (
                          <p className="text-[11px] text-muted-foreground">
                            {fmtDate(doc.expiration_date)}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
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
                            onClick={() =>
                              isActiveEdit ? setEditingDoc(null) : handleEditOpen(doc)
                            }
                            className={`text-xs transition-colors ${
                              isActiveEdit
                                ? "text-amber-600 hover:text-amber-700 font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {isActiveEdit ? "Close" : "Edit"}
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
          {filtered.length} of {documents.length} document{documents.length !== 1 ? "s" : ""}.{" "}
          Download links expire after 1 hour.
        </p>
      )}
    </div>
  );
}

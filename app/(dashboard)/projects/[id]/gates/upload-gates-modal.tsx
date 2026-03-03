"use client";

import { useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { uploadGates, type GateUploadRow } from "./actions";

interface UploadGatesModalProps {
  projectId: string;
  onDone: () => void;
}

type ParsedRow = GateUploadRow & { _warnings: string[] };

const FIXED_COLS = new Set(["gate name", "sequence", "start date", "end date", "notes"]);

function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Try YYYY-MM-DD or MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s; // leave as-is, server will reject if invalid
}

function parseWorkbook(buf: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map((h) => String(h ?? "").trim());
  const dataRows = raw.slice(1);

  // Build column index map
  const idx: Record<string, number> = {};
  const codeCols: { col: string; index: number }[] = [];

  headers.forEach((h, i) => {
    const lower = h.toLowerCase();
    if (lower === "gate name") idx.name = i;
    else if (lower === "sequence") idx.sequence = i;
    else if (lower === "start date") idx.start_date = i;
    else if (lower === "end date") idx.end_date = i;
    else if (lower === "notes") idx.notes = i;
    else if (h && !FIXED_COLS.has(lower)) codeCols.push({ col: h, index: i });
  });

  const result: ParsedRow[] = [];
  let seqCounter = 1;

  for (const row of dataRows) {
    const cols = row as unknown[];
    const name = String(cols[idx.name] ?? "").trim();
    if (!name) continue; // skip blank rows

    const warnings: string[] = [];
    const seqRaw = idx.sequence !== undefined ? cols[idx.sequence] : undefined;
    let seq = seqRaw !== undefined && seqRaw !== "" ? Number(seqRaw) : NaN;
    if (isNaN(seq)) { seq = seqCounter; }
    seqCounter = seq + 1;

    const budgets: Record<string, number> = {};
    for (const { col, index } of codeCols) {
      const val = cols[index];
      const n = val !== "" ? Number(val) : 0;
      if (isNaN(n)) {
        warnings.push(`Column "${col}" value "${val}" is not a number — using 0`);
        budgets[col] = 0;
      } else {
        budgets[col] = n;
      }
    }

    result.push({
      name,
      sequence_number: seq,
      start_date: normalizeDate(idx.start_date !== undefined ? cols[idx.start_date] : null),
      end_date: normalizeDate(idx.end_date !== undefined ? cols[idx.end_date] : null),
      notes: idx.notes !== undefined ? String(cols[idx.notes] ?? "").trim() || null : null,
      budgets,
      _warnings: warnings,
    });
  }

  return result;
}

function fmtCurrency(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function UploadGatesModal({ projectId, onDone }: UploadGatesModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFile(file: File) {
    setParseError(null);
    setUploadError(null);
    setRows(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseWorkbook(e.target!.result as ArrayBuffer);
        if (parsed.length === 0) {
          setParseError("No data rows found. Make sure the file has a header row and at least one gate row.");
          return;
        }
        setRows(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleConfirm() {
    if (!rows) return;
    setUploadError(null);
    const payload: GateUploadRow[] = rows.map(({ _warnings: _w, ...r }) => r);
    startTransition(async () => {
      try {
        const result = await uploadGates(projectId, payload);
        if (result.error) { setUploadError(result.error); return; }
        onDone();
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  const codeCols = rows && rows.length > 0
    ? Object.keys(rows[0].budgets)
    : [];

  const allWarnings = rows?.flatMap((r) => r._warnings) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upload Gates from Excel</p>
        <a
          href={`/api/projects/${projectId}/gates/template`}
          className="text-xs text-primary hover:underline underline-offset-2 font-medium"
        >
          Download template ↓
        </a>
      </div>

      {/* Drop zone */}
      {!rows && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
        >
          <p className="text-sm font-medium">Drop an Excel file here, or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Accepts .xlsx or .xls</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {parseError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {parseError}
        </div>
      )}

      {/* Preview */}
      {rows && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{rows.length} gate{rows.length !== 1 ? "s" : ""} found</span>
              <span className="text-muted-foreground ml-2 text-xs">in {fileName}</span>
            </div>
            <button
              onClick={() => { setRows(null); setFileName(null); setParseError(null); setUploadError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change file
            </button>
          </div>

          {allWarnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-xs text-yellow-800 space-y-0.5">
              <p className="font-medium">Warnings — review before confirming:</p>
              {allWarnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Gate Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Start</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">End</th>
                  {codeCols.map((c) => (
                    <th key={c} className="px-3 py-2 text-right font-medium text-muted-foreground">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.sequence_number}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.start_date ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.end_date ?? "—"}</td>
                    {codeCols.map((c) => (
                      <td key={c} className="px-3 py-2 text-right font-mono">
                        {fmtCurrency(r.budgets[c] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {rows && (
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending ? `Creating ${rows.length} gate${rows.length !== 1 ? "s" : ""}…` : `Confirm — Create ${rows.length} gate${rows.length !== 1 ? "s" : ""}`}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded border px-3 py-1.5 text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

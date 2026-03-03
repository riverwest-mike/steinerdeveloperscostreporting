"use client";

import { useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { uploadGates, type GateUploadRow } from "./actions";

interface ExistingGate {
  id: string;
  name: string;
  sequence_number: number;
  is_locked: boolean;
}

interface UploadGatesModalProps {
  projectId: string;
  existingGates: ExistingGate[];
  onDone: () => void;
}

type RowAction = "new" | "replace" | "locked";

type ParsedRow = GateUploadRow & {
  _warnings: string[];
  _action: RowAction;
  _existingName?: string; // name of the gate being replaced
};

const FIXED_COLS = new Set(["gate name", "sequence", "start date", "end date", "notes"]);

function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

function parseWorkbook(
  buf: ArrayBuffer,
  seqToExisting: Record<number, ExistingGate>
): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map((h) => String(h ?? "").trim());
  const dataRows = raw.slice(1);

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
    if (!name) continue;

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

    const existing = seqToExisting[seq];
    let action: RowAction = "new";
    let existingName: string | undefined;

    if (existing) {
      action = existing.is_locked ? "locked" : "replace";
      existingName = existing.name;
    }

    result.push({
      name,
      sequence_number: seq,
      start_date: normalizeDate(idx.start_date !== undefined ? cols[idx.start_date] : null),
      end_date: normalizeDate(idx.end_date !== undefined ? cols[idx.end_date] : null),
      notes: idx.notes !== undefined ? String(cols[idx.notes] ?? "").trim() || null : null,
      budgets,
      _warnings: warnings,
      _action: action,
      _existingName: existingName,
    });
  }

  return result;
}

function fmtCurrency(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

const ACTION_BADGE: Record<RowAction, string> = {
  new: "bg-green-100 text-green-800",
  replace: "bg-orange-100 text-orange-800",
  locked: "bg-red-100 text-red-700",
};

const ACTION_LABEL: Record<RowAction, string> = {
  new: "NEW",
  replace: "REPLACE",
  locked: "LOCKED",
};

export function UploadGatesModal({ projectId, existingGates, onDone }: UploadGatesModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [unknownCodes, setUnknownCodes] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  // Build sequence → existing gate map for quick lookup
  const seqToExisting: Record<number, ExistingGate> = {};
  for (const g of existingGates) seqToExisting[g.sequence_number] = g;

  function handleFile(file: File) {
    setParseError(null);
    setUploadError(null);
    setRows(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseWorkbook(e.target!.result as ArrayBuffer, seqToExisting);
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
    setUnknownCodes(null);
    // Strip internal fields before sending to server
    const payload: GateUploadRow[] = rows
      .filter((r) => r._action !== "locked")
      .map(({ _warnings: _w, _action: _a, _existingName: _e, ...r }) => r);
    startTransition(async () => {
      try {
        const result = await uploadGates(projectId, payload);
        if (result.error) { setUploadError(result.error); return; }
        if (result.unknownCodes?.length) {
          setUnknownCodes(result.unknownCodes);
          // Still close — gates were created, just budgets for unknown codes were skipped
          return;
        }
        onDone();
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  const codeCols = rows && rows.length > 0 ? Object.keys(rows[0].budgets) : [];
  const allWarnings = rows?.flatMap((r) => r._warnings) ?? [];
  const replaceCount = rows?.filter((r) => r._action === "replace").length ?? 0;
  const newCount = rows?.filter((r) => r._action === "new").length ?? 0;
  const lockedCount = rows?.filter((r) => r._action === "locked").length ?? 0;
  const processableCount = (rows?.length ?? 0) - lockedCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Upload Gates from Excel
        </p>
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
          {/* Summary line */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              {newCount > 0 && (
                <span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-green-100 text-green-800 mr-1">NEW</span>
                  {newCount} gate{newCount !== 1 ? "s" : ""}
                </span>
              )}
              {replaceCount > 0 && (
                <span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-orange-100 text-orange-800 mr-1">REPLACE</span>
                  {replaceCount} gate{replaceCount !== 1 ? "s" : ""}
                </span>
              )}
              {lockedCount > 0 && (
                <span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-red-100 text-red-700 mr-1">LOCKED</span>
                  {lockedCount} skipped
                </span>
              )}
              <span className="text-muted-foreground">from {fileName}</span>
            </div>
            <button
              onClick={() => { setRows(null); setFileName(null); setParseError(null); setUploadError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change file
            </button>
          </div>

          {/* Replace warning */}
          {replaceCount > 0 && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-xs text-orange-800">
              <p className="font-medium">
                {replaceCount} existing gate{replaceCount !== 1 ? "s" : ""} will be overwritten with values from this file.
              </p>
              <p className="mt-0.5">Gate name, dates, notes, and original budget amounts will be replaced. Approved change order amounts are not affected.</p>
            </div>
          )}

          {/* Locked notice */}
          {lockedCount > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-medium">
                {lockedCount} row{lockedCount !== 1 ? "s" : ""} match a locked gate and will be skipped.
              </p>
              <p className="mt-0.5">Locked gates cannot be modified. Close the gate first if you need to update it.</p>
            </div>
          )}

          {/* Numeric warnings */}
          {allWarnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-xs text-yellow-800 space-y-0.5">
              <p className="font-medium">Value warnings — review before confirming:</p>
              {allWarnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
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
                  <tr
                    key={i}
                    className={`border-b last:border-0 ${r._action === "locked" ? "opacity-40" : "hover:bg-muted/10"}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${ACTION_BADGE[r._action]}`}>
                        {ACTION_LABEL[r._action]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.sequence_number}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.name}</span>
                      {r._action === "replace" && r._existingName && r._existingName !== r.name && (
                        <span className="ml-1.5 text-muted-foreground line-through">{r._existingName}</span>
                      )}
                      {r._action === "replace" && r._existingName && r._existingName === r.name && (
                        <span className="ml-1.5 text-muted-foreground">(same name)</span>
                      )}
                    </td>
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

      {unknownCodes && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-xs text-orange-800 space-y-1">
          <p className="font-medium">
            Gates were created, but these column headers did not match any cost category code and were skipped:
          </p>
          <p className="font-mono">{unknownCodes.join(", ")}</p>
          <p className="text-orange-700">
            Budget amounts for those categories are 0. Check that the column headers exactly match the cost category codes in Admin → Cost Categories, then re-upload to correct them.
          </p>
          <button onClick={onDone} className="mt-1 rounded border border-orange-400 px-2.5 py-1 text-xs font-medium hover:bg-orange-100">
            Close
          </button>
        </div>
      )}

      {rows && processableCount > 0 && !unknownCodes && (
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {isPending
              ? "Saving…"
              : `Confirm — ${newCount > 0 ? `Create ${newCount}` : ""}${newCount > 0 && replaceCount > 0 ? ", " : ""}${replaceCount > 0 ? `Replace ${replaceCount}` : ""}`}
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

      {rows && processableCount === 0 && !unknownCodes && (
        <div className="flex gap-2 items-center">
          <p className="text-xs text-muted-foreground">All rows match locked gates — nothing to import.</p>
          <button type="button" onClick={onDone} className="rounded border px-3 py-1.5 text-xs font-medium">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

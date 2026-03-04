"use client";

import { useState } from "react";

interface SyncResult {
  syncId?: string;
  status?: string;
  records_fetched?: number;
  records_upserted?: number;
  projects_synced?: number;
  as_of_date?: string;
  accounting_basis?: string;
  error?: string;
  message?: string;
}

export function BalanceSheetSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const [asOfDate, setAsOfDate] = useState(today);
  const [accountingBasis, setAccountingBasis] = useState<"Cash" | "Accrual">("Accrual");

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/appfolio/sync-balance-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate, accountingBasis }),
      });

      const data: SyncResult = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Sync failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="bs-as-of">As of Date</label>
          <input
            id="bs-as-of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            disabled={syncing}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="bs-basis">Accounting Basis</label>
          <select
            id="bs-basis"
            value={accountingBasis}
            onChange={(e) => setAccountingBasis(e.target.value as "Cash" | "Accrual")}
            disabled={syncing}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="Accrual">Accrual</option>
            <option value="Cash">Cash</option>
          </select>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive font-medium">Sync failed</p>
          <p className="text-xs text-destructive/80 mt-1">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950/30">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Sync completed</p>
          <div className="mt-2 grid grid-cols-3 gap-4 text-xs text-green-700 dark:text-green-300">
            <div>
              <span className="font-medium">{result.records_fetched?.toLocaleString() ?? 0}</span> accounts fetched
            </div>
            <div>
              <span className="font-medium">{result.records_upserted?.toLocaleString() ?? 0}</span> records stored
            </div>
            <div>
              <span className="font-medium">{result.projects_synced ?? 0}</span> projects synced
            </div>
          </div>
          {result.message && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

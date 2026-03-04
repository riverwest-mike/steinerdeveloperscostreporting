"use client";

import { useState } from "react";

interface PreviewRow {
  appfolio_bill_id: string;
  payee_name: string;
  bill_date: string | null;
  invoice_amount: number;
  raw_project_cost_category: string | null;
  would_store_cost_category_code: string | null;
  would_store_cost_category_name: string | null;
}

interface PreviewResult {
  property_id: string;
  date_range: { fromDate: string; toDate: string };
  total_rows: number;
  rows_with_cost_category: number;
  rows_without_cost_category: number;
  preview: PreviewRow[];
  error?: string;
}

export function SyncPreview() {
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [useOldFromDate, setUseOldFromDate] = useState(false);

  async function handlePreview() {
    if (!propertyId.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = new URLSearchParams({ property_id: propertyId.trim() });
      if (useOldFromDate) params.set("from_date", "2000-01-01");
      const res = await fetch(`/api/appfolio/sync-preview?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          placeholder="AppFolio Property ID (e.g. 196)"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm w-52"
        />
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useOldFromDate}
            onChange={(e) => setUseOldFromDate(e.target.checked)}
            className="accent-primary"
          />
          Use <code className="font-mono text-xs bg-muted px-1 rounded">fromDate=2000-01-01</code>
          <span className="text-muted-foreground text-xs">(same as "Run Report" button)</span>
        </label>
        <button
          onClick={handlePreview}
          disabled={loading || !propertyId.trim()}
          className="rounded border border-input bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading ? "Fetching from AppFolio…" : "Run Sync Preview"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex gap-6 text-sm flex-wrap">
            <span><span className="font-medium">{result.total_rows}</span> rows from AppFolio</span>
            <span className="text-green-700 font-medium">✓ {result.rows_with_cost_category} would have cost category code</span>
            <span className="text-red-600 font-medium">✗ {result.rows_without_cost_category} would store null</span>
            <span className="text-muted-foreground text-xs">
              from: <code className="font-mono">{result.date_range.fromDate}</code> to <code className="font-mono">{result.date_range.toDate}</code>
            </span>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-medium">Bill ID</th>
                  <th className="px-3 py-2 text-left font-medium">Vendor</th>
                  <th className="px-3 py-2 text-left font-medium">Bill Date</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Raw project_cost_category from AppFolio</th>
                  <th className="px-3 py-2 text-left font-medium">Would store code</th>
                  <th className="px-3 py-2 text-left font-medium">Would store name</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, i) => (
                  <tr key={i} className={`border-b last:border-0 ${!row.would_store_cost_category_code ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{row.appfolio_bill_id}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate" title={row.payee_name}>{row.payee_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.bill_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(row.invoice_amount)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.raw_project_cost_category
                        ? <span className="text-green-700">{row.raw_project_cost_category}</span>
                        : <span className="text-red-600 italic">null / missing</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      {row.would_store_cost_category_code
                        ? <code className="font-mono bg-green-100 text-green-800 px-1 rounded">{row.would_store_cost_category_code}</code>
                        : <span className="text-red-600 italic">null</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.would_store_cost_category_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

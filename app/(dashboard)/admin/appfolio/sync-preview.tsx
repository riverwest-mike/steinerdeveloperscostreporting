"use client";

import { useState } from "react";

interface ComparisonRow {
  appfolio_bill_id: string;
  payee_name: string;
  bill_date: string | null;
  invoice_amount: number;
  appfolio_code: string | null;
  appfolio_name: string | null;
  db_exists: boolean;
  db_property_id: string | null;
  db_code: string | null;
  db_name: string | null;
  match: boolean;
}

interface DbRow {
  appfolio_bill_id: string;
  appfolio_property_id: string;
  cost_category_code: string | null;
  vendor_name: string | null;
  invoice_amount: number | null;
  bill_date: string | null;
}

interface PreviewResult {
  property_id: string;
  date_range: { fromDate: string; toDate: string };
  total_rows: number;
  rows_with_cost_category: number;
  rows_without_cost_category: number;
  db_error: string | null;
  db_rows_total_for_property: number;
  db_rows_with_correct_code: number;
  db_rows_with_null_code: number;
  db_rows_missing: number;
  comparison: ComparisonRow[];
  all_db_rows_for_property: DbRow[];
  error?: string;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

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
    <div className="space-y-4">
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
          {loading ? "Fetching…" : "Run Sync Preview + DB Check"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="AppFolio rows" value={result.total_rows} />
            <StatCard label="AppFolio with code" value={result.rows_with_cost_category} good />
            <StatCard label="DB rows for property" value={result.db_rows_total_for_property} />
            <StatCard label="DB codes correct" value={result.db_rows_with_correct_code} good={result.db_rows_with_correct_code === result.rows_with_cost_category} bad={result.db_rows_with_correct_code === 0} />
          </div>
          {result.db_error && (
            <div className="text-sm text-destructive font-medium">DB error: {result.db_error}</div>
          )}
          {result.db_rows_with_null_code > 0 && (
            <div className="rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              <strong>{result.db_rows_with_null_code}</strong> DB row(s) exist for these bill IDs but have <code className="font-mono text-xs">cost_category_code = null</code>
              {" "}— AppFolio returns a code but the DB doesn&apos;t have it. The upsert may be failing.
            </div>
          )}
          {result.db_rows_missing > 0 && (
            <div className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <strong>{result.db_rows_missing}</strong> bill ID(s) from AppFolio are not in the DB at all yet.
            </div>
          )}

          {/* Side-by-side comparison */}
          <div>
            <h4 className="text-sm font-semibold mb-2">AppFolio vs DB — side by side</h4>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">Bill ID</th>
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium border-l">AppFolio code</th>
                    <th className="px-3 py-2 text-left font-medium">AppFolio name</th>
                    <th className="px-3 py-2 text-left font-medium border-l">DB code</th>
                    <th className="px-3 py-2 text-left font-medium">DB name</th>
                    <th className="px-3 py-2 text-left font-medium">DB prop_id</th>
                    <th className="px-3 py-2 text-left font-medium">Match?</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.map((row, i) => (
                    <tr key={i} className={`border-b last:border-0 ${!row.match ? "bg-red-50" : ""}`}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{row.appfolio_bill_id}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={row.payee_name}>{row.payee_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt.format(row.invoice_amount)}</td>
                      <td className="px-3 py-2 border-l">
                        {row.appfolio_code
                          ? <code className="font-mono bg-green-100 text-green-800 px-1 rounded">{row.appfolio_code}</code>
                          : <span className="text-muted-foreground italic">null</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.appfolio_name ?? "—"}</td>
                      <td className="px-3 py-2 border-l">
                        {!row.db_exists
                          ? <span className="text-yellow-600 italic">not in DB</span>
                          : row.db_code
                          ? <code className="font-mono bg-green-100 text-green-800 px-1 rounded">{row.db_code}</code>
                          : <span className="text-red-600 font-medium">null ← BUG</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.db_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.db_property_id ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.match
                          ? <span className="text-green-700">✓</span>
                          : <span className="text-red-600 font-bold">✗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* All DB rows for property */}
          <details>
            <summary className="text-sm font-semibold cursor-pointer">
              All DB rows for property {result.property_id} ({result.all_db_rows_for_property.length} rows)
            </summary>
            <div className="mt-2 rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">Bill ID (DB)</th>
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">cost_category_code</th>
                    <th className="px-3 py-2 text-left font-medium">appfolio_property_id</th>
                    <th className="px-3 py-2 text-left font-medium">bill_date</th>
                  </tr>
                </thead>
                <tbody>
                  {result.all_db_rows_for_property.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{row.appfolio_bill_id}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={row.vendor_name ?? ""}>{row.vendor_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.invoice_amount != null ? fmt.format(row.invoice_amount) : "—"}</td>
                      <td className="px-3 py-2">
                        {row.cost_category_code
                          ? <code className="font-mono bg-green-100 text-green-800 px-1 rounded">{row.cost_category_code}</code>
                          : <span className="text-red-600 italic">null</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.appfolio_property_id}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.bill_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${good ? "border-green-300 bg-green-50" : bad ? "border-red-300 bg-red-50" : "border-border bg-muted/30"}`}>
      <div className={`text-2xl font-bold tabular-nums ${good ? "text-green-700" : bad ? "text-red-600" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface MatchResult {
  vendor_name: string;
  invoice_amount: number;
  raw_cost_category_code: string | null;
  uppercased_code: string;
  catId_found: string | null;
  matched_category_name: string | null;
  matched_category_code: string | null;
  result: string;
}

interface FullRow {
  appfolio_bill_id: unknown;
  cost_category_code: unknown;
  vendor_name: unknown;
}

interface DebugResult {
  query_params: { propertyId: string; asOf: string };
  tx_query_error: string | null;
  tx_count: number;
  tx_raw_rows: { cost_category_code: string | null; vendor_name: string; invoice_amount: number }[];
  tx_full_rows_cost_code: FullRow[];
  tx_full_query_error: string | null;
  categories_count: number;
  code_map_entries: { key: string; category: string | undefined }[];
  match_results: MatchResult[];
  error?: string;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

export function ReportQueryDebug() {
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    if (!propertyId.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = new URLSearchParams({ property_id: propertyId.trim(), as_of: asOf });
      const res = await fetch(`/api/debug/report-query?${params.toString()}`);
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
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleRun}
          disabled={loading || !propertyId.trim()}
          className="rounded border border-input bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading ? "Running…" : "Run Report Query Debug"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm flex-wrap">
            <span><strong>{result.tx_count}</strong> transactions returned by report query</span>
            <span><strong>{result.categories_count}</strong> cost categories loaded</span>
            <span><strong>{result.code_map_entries.length}</strong> code map entries</span>
            {result.tx_query_error && <span className="text-red-600">Query error: {result.tx_query_error}</span>}
          </div>

          {/* Raw rows as report query sees them */}
          <div>
            <h4 className="text-sm font-semibold mb-2">
              What the report query returns (SELECT cost_category_code, cost_category_name, vendor_name, invoice_amount)
            </h4>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">vendor_name</th>
                    <th className="px-3 py-2 text-right font-medium">amount</th>
                    <th className="px-3 py-2 text-left font-medium">cost_category_code (as returned)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tx_raw_rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.vendor_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt.format(r.invoice_amount)}</td>
                      <td className="px-3 py-2 font-mono">
                        {r.cost_category_code != null
                          ? <code className="bg-green-100 text-green-800 px-1 rounded">{r.cost_category_code}</code>
                          : <span className="text-red-600 font-bold">NULL ← report query returns null!</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SELECT * comparison */}
          <div>
            <h4 className="text-sm font-semibold mb-2">
              SELECT * for same rows (confirms actual DB value)
            </h4>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">bill_id</th>
                    <th className="px-3 py-2 text-left font-medium">vendor_name</th>
                    <th className="px-3 py-2 text-left font-medium">cost_category_code (SELECT *)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tx_full_rows_cost_code.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono">{String(r.appfolio_bill_id)}</td>
                      <td className="px-3 py-2">{String(r.vendor_name)}</td>
                      <td className="px-3 py-2 font-mono">
                        {r.cost_category_code != null
                          ? <code className="bg-green-100 text-green-800 px-1 rounded">{String(r.cost_category_code)}</code>
                          : <span className="text-red-600">null</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Match results */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Matching results</h4>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">vendor</th>
                    <th className="px-3 py-2 text-left font-medium">code in DB</th>
                    <th className="px-3 py-2 text-left font-medium">uppercased for lookup</th>
                    <th className="px-3 py-2 text-left font-medium">matched category</th>
                    <th className="px-3 py-2 text-left font-medium">result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.match_results.map((r, i) => (
                    <tr key={i} className={`border-b last:border-0 ${r.result === "MATCHED" ? "" : "bg-red-50"}`}>
                      <td className="px-3 py-2 max-w-[140px] truncate">{r.vendor_name}</td>
                      <td className="px-3 py-2 font-mono">{r.raw_cost_category_code ?? <span className="italic text-red-600">null</span>}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">&quot;{r.uppercased_code}&quot;</td>
                      <td className="px-3 py-2">{r.matched_category_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.result === "MATCHED"
                          ? <span className="text-green-700 font-medium">✓ matched</span>
                          : <span className="text-red-600 text-xs">{r.result}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Code map */}
          <details>
            <summary className="text-sm font-semibold cursor-pointer">
              Code map ({result.code_map_entries.length} entries) — keys the report uses to match
            </summary>
            <div className="mt-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                {result.code_map_entries.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <code className="bg-muted px-1 rounded">{e.key}</code>
                    <span className="text-muted-foreground truncate">{e.category}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface EndpointResult {
  error?: string;
  total_records?: number;
  filtered_records?: number;
  has_next_page?: boolean;
  all_field_names?: string[];
  cost_related_fields?: string[];
  detected_cost_category_field?: string | null;
  records_with_cost_category?: number;
  records_without_cost_category?: number;
  sample_with_cost_category?: Record<string, unknown>[];
  sample_without_cost_category?: Record<string, unknown>[];
}

interface TestResult {
  date_range?: { fromDate: string; toDate: string };
  filter?: unknown;
  endpoints?: Record<string, EndpointResult>;
  error?: string;
}

export function FieldInspector({ propertyId }: { propertyId?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vendor, setVendor] = useState("");

  async function handleInspect() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = new URLSearchParams({ days: "365" });
      if (propertyId) params.set("property_id", propertyId);
      if (vendor.trim()) params.set("vendor", vendor.trim());
      const res = await fetch(`/api/appfolio/test?${params}`);
      const data: TestResult = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const vl = result?.endpoints?.vendor_ledger;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Filter by vendor name (e.g. Kimley)"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm w-64"
        />
        <button
          onClick={handleInspect}
          disabled={loading}
          className="rounded border border-input bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading ? "Fetching…" : "Inspect Raw API Fields"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && vl && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
          {vl.error ? (
            <p className="text-destructive">vendor_ledger error: {vl.error}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-xs">
                <span><span className="font-medium">{vl.total_records ?? 0}</span> total rows</span>
                {vl.filtered_records !== undefined && (
                  <span><span className="font-medium">{vl.filtered_records}</span> matching vendor filter</span>
                )}
                {vl.has_next_page && (
                  <span className="text-amber-600 font-medium">⚠ More pages exist (not all fetched)</span>
                )}
                <span>
                  <span className="font-medium text-green-700">{vl.records_with_cost_category ?? 0}</span> with project_cost_category
                </span>
                <span>
                  <span className="font-medium text-red-600">{vl.records_without_cost_category ?? 0}</span> without project_cost_category
                </span>
              </div>

              {/* Sample rows WITHOUT cost category — the key diagnostic */}
              {(vl.sample_without_cost_category ?? []).length > 0 && (
                <details open className="text-xs">
                  <summary className="cursor-pointer font-medium select-none text-red-700">
                    Sample rows WITHOUT project_cost_category ({vl.records_without_cost_category ?? 0} total) — click to expand
                  </summary>
                  <div className="mt-2 space-y-2">
                    {(vl.sample_without_cost_category ?? []).map((row, i) => (
                      <pre key={i} className="overflow-x-auto bg-muted rounded p-2 text-[11px]">
                        {JSON.stringify(row, null, 2)}
                      </pre>
                    ))}
                  </div>
                </details>
              )}

              {/* Sample rows WITH cost category */}
              {(vl.sample_with_cost_category ?? []).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium select-none text-green-700">
                    Sample rows WITH project_cost_category ({vl.records_with_cost_category ?? 0} total)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {(vl.sample_with_cost_category ?? []).map((row, i) => (
                      <pre key={i} className="overflow-x-auto bg-muted rounded p-2 text-[11px]">
                        {JSON.stringify(row, null, 2)}
                      </pre>
                    ))}
                  </div>
                </details>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer font-medium select-none">
                  All field names ({(vl.all_field_names ?? []).length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(vl.all_field_names ?? []).map((f) => (
                    <code key={f} className="font-mono bg-muted px-1 rounded">{f}</code>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}

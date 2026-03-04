"use client";

import { useState } from "react";

interface EndpointResult {
  error?: string;
  total_records?: number;
  all_field_names?: string[];
  cost_related_fields?: string[];
  detected_cost_category_field?: string | null;
  records_with_cost_category?: number;
  sample_with_cost_category?: Record<string, unknown>[];
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

  async function handleInspect() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const url = propertyId
        ? `/api/appfolio/test?property_id=${propertyId}&days=365`
        : `/api/appfolio/test?days=365`;
      const res = await fetch(url);
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
      <button
        onClick={handleInspect}
        disabled={loading}
        className="rounded border border-input bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
      >
        {loading ? "Fetching…" : "Inspect Raw API Fields"}
      </button>

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
              <div className="flex gap-6 text-xs">
                <span><span className="font-medium">{vl.total_records ?? 0}</span> rows fetched</span>
                <span>
                  Cost category field:{" "}
                  {vl.detected_cost_category_field ? (
                    <code className="font-mono bg-green-100 text-green-800 px-1 rounded">
                      {vl.detected_cost_category_field}
                    </code>
                  ) : (
                    <span className="text-red-600 font-medium">not detected</span>
                  )}
                </span>
                <span>
                  <span className="font-medium">{vl.records_with_cost_category ?? 0}</span> rows have a cost category
                </span>
              </div>

              {(vl.cost_related_fields ?? []).length > 0 && (
                <div className="text-xs">
                  <span className="font-medium">Cost/category fields found: </span>
                  {(vl.cost_related_fields ?? []).map((f) => (
                    <code key={f} className="font-mono bg-muted px-1 rounded mr-1">{f}</code>
                  ))}
                </div>
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

              {(vl.sample_with_cost_category ?? []).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium select-none">
                    Sample row with cost category
                  </summary>
                  <pre className="mt-2 overflow-x-auto bg-muted rounded p-2 text-[11px]">
                    {JSON.stringify(vl.sample_with_cost_category![0], null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

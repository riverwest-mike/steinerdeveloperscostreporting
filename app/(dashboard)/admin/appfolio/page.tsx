export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { SyncButton } from "./sync-button";
import { LinkProjects } from "./link-projects";

export default async function AppFolioSyncPage() {
  const { userId } = await auth();
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (user?.role !== "admin") {
    redirect("/dashboard");
  }

  // Get recent syncs
  const { data: syncs } = await supabase
    .from("appfolio_syncs")
    .select("id, triggered_by, sync_type, status, records_fetched, records_upserted, records_unmapped, error_message, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);

  // Get user names for sync history
  const triggeredByIds = [...new Set((syncs ?? []).map((s: { triggered_by: string | null }) => s.triggered_by).filter(Boolean))] as string[];
  const userMap = new Map<string, string>();
  if (triggeredByIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", triggeredByIds);
    for (const u of users ?? []) {
      userMap.set(u.id, u.full_name);
    }
  }

  // Get count of projects with AppFolio property ID
  const { count: linkedProjectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .not("appfolio_property_id", "is", null)
    .neq("appfolio_property_id", "");

  // Get total transaction count
  const { count: transactionCount } = await supabase
    .from("appfolio_transactions")
    .select("id", { count: "exact", head: true });

  // Diagnostic: distinct cost category codes across all stored transactions vs system codes
  const [{ data: rawDistinctCats }, { data: rawCostCats }] = await Promise.all([
    supabase
      .from("appfolio_transactions")
      .select("cost_category_code, cost_category_name")
      .order("cost_category_code"),
    supabase
      .from("cost_categories")
      .select("code, name")
      .eq("is_active", true),
  ]);

  const catCodeSet = new Set(
    (rawCostCats ?? []).map((c: { code: string }) => c.code.trim().toUpperCase())
  );

  // Deduplicate by cost_category_code
  const costCatMap = new Map<string, { name: string; matched: boolean }>();
  for (const tx of (rawDistinctCats ?? []) as {
    cost_category_code: string | null;
    cost_category_name: string | null;
  }[]) {
    const code = (tx.cost_category_code ?? "").trim().toUpperCase();
    if (!costCatMap.has(code)) {
      costCatMap.set(code, {
        name: tx.cost_category_name ?? code,
        matched: code ? catCodeSet.has(code) : false,
      });
    }
  }

  const distinctCostCats = Array.from(costCatMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, { name, matched }]) => ({ code, name, matched }));

  // Get ALL active projects with their current AppFolio property ID (for the mapping table)
  const { data: allActiveProjects } = await supabase
    .from("projects")
    .select("id, name, code, appfolio_property_id")
    .eq("status", "active")
    .order("name");

  const allProjects = (allActiveProjects ?? []) as {
    id: string; name: string; code: string; appfolio_property_id: string | null;
  }[];

  const unlinkedProjects = allProjects.filter(
    (p) => !p.appfolio_property_id || p.appfolio_property_id.trim() === ""
  );

  return (
    <div>
      <Header title="AppFolio Sync" />
      <div className="p-6 space-y-8">
        <div>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground font-medium">AppFolio Sync</span>
          </nav>
          <h2 className="text-2xl font-bold tracking-tight">AppFolio Sync</h2>
          <p className="text-muted-foreground mt-1">
            Pull bill and transaction data from AppFolio into the cost tracker.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 max-w-2xl">
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Linked Projects</p>
            <p className="text-2xl font-bold">{linkedProjectCount ?? 0}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Stored Transactions</p>
            <p className="text-2xl font-bold">{(transactionCount ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last Sync</p>
            <p className="text-sm font-medium">
              {syncs && syncs.length > 0
                ? new Date(syncs[0].started_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Never"}
            </p>
          </div>
        </div>

        {/* All project → property mappings */}
        <div>
          <h3 className="text-lg font-semibold mb-1">Project → AppFolio Property Mapping</h3>
          <p className="text-sm text-muted-foreground mb-4">
            All active projects and their linked AppFolio Property IDs. The sync only pulls transactions
            for properties listed here. Use the{" "}
            <span className="font-mono text-xs bg-muted px-1 rounded">Edit</span> link to update an ID.
            Find a Property ID in AppFolio by opening the property and copying the number from the URL:
            {" "}<span className="font-mono text-xs">…/properties/<strong>12345</strong>/edit</span>
          </p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-2 text-left font-medium">Project</th>
                  <th className="px-4 py-2 text-left font-medium">Code</th>
                  <th className="px-4 py-2 text-left font-medium">AppFolio Property ID</th>
                </tr>
              </thead>
              <tbody>
                {allProjects.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{p.code}</td>
                    <td className="px-4 py-2">
                      {p.appfolio_property_id ? (
                        <span className="font-mono text-green-700">{p.appfolio_property_id}</span>
                      ) : (
                        <span className="text-red-600 text-xs">Not set</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unlinkedProjects.length > 0 && (
            <div className="mt-4">
              <LinkProjects
                projects={unlinkedProjects}
                appfolioBaseUrl={process.env.APPFOLIO_DATABASE_URL ?? "your AppFolio account"}
              />
            </div>
          )}
        </div>

        {/* Sync controls */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Run Sync</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pulls vendor ledger records from AppFolio for all projects that have an AppFolio Property ID configured.
            The Project Cost Category on each bill is used to match transactions to cost categories.
          </p>
          <SyncButton />
        </div>

        {/* Sync history */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Sync History</h3>
          {(!syncs || syncs.length === 0) ? (
            <p className="text-sm text-muted-foreground">No syncs have been run yet.</p>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Fetched</th>
                    <th className="px-4 py-3 text-right font-medium">Stored</th>
                    <th className="px-4 py-3 text-left font-medium">Triggered By</th>
                    <th className="px-4 py-3 text-left font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {syncs.map((s: {
                    id: string;
                    triggered_by: string | null;
                    sync_type: string;
                    status: string;
                    records_fetched: number | null;
                    records_upserted: number | null;
                    records_unmapped: number | null;
                    error_message: string | null;
                    started_at: string;
                    completed_at: string | null;
                  }) => {
                    const duration = s.completed_at
                      ? Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)
                      : null;
                    return (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(s.started_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 capitalize">{s.sync_type}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              s.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : s.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {s.status}
                          </span>
                          {s.error_message && (
                            <p className="text-xs text-destructive mt-1 max-w-xs truncate" title={s.error_message}>
                              {s.error_message}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {s.records_fetched?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {s.records_upserted?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {s.triggered_by ? userMap.get(s.triggered_by) ?? "Unknown" : "System"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {duration != null ? `${duration}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Cost Category Diagnostics */}
        <div>
          <h3 className="text-lg font-semibold mb-1">Cost Category Diagnostics</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Distinct AppFolio Project Cost Category codes from synced transactions, compared against
            active cost category codes in this system. Unmatched codes will show $0 in Cost to Date.
          </p>

          {distinctCostCats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions synced yet.</p>
          ) : (
            <>
              <div className="flex gap-4 mb-3 text-sm">
                <span className="text-green-700 font-medium">
                  ✓ {distinctCostCats.filter((c) => c.matched).length} matched
                </span>
                <span className="text-red-600 font-medium">
                  ✗ {distinctCostCats.filter((c) => !c.matched).length} unmatched
                </span>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-4 py-2 text-left font-medium">AppFolio Cost Category Code</th>
                      <th className="px-4 py-2 text-left font-medium">AppFolio Cost Category Name</th>
                      <th className="px-4 py-2 text-left font-medium">Matches System Code?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distinctCostCats.map(({ code, name, matched }) => (
                      <tr key={code} className="border-b last:border-0">
                        <td className="px-4 py-2 font-mono">{code || "(none)"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{name}</td>
                        <td className="px-4 py-2">
                          {matched ? (
                            <span className="text-green-700 font-medium">✓ Yes</span>
                          ) : (
                            <span className="text-red-600 font-medium">✗ No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

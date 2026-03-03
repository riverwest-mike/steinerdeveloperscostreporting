export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { SyncButton } from "./sync-button";

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

        {/* Sync controls */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Run Sync</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pulls bill detail records from AppFolio for all projects that have an AppFolio Property ID configured.
            The GL Account on each bill will be matched to cost categories by code.
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
      </div>
    </div>
  );
}

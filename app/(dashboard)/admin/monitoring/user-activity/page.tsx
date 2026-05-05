export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

const PAGE_SIZE = 100;

export default async function UserActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; userId?: string }>;
}) {
  const authUserId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUserId!)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const filterUserId = sp.userId ?? null;
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("user_activity_logs")
    .select("id, user_id, action, path, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (filterUserId) query = query.eq("user_id", filterUserId);

  const { data: logs, count } = await query;

  // Fetch all users for filter dropdown + name lookup
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .order("full_name");

  const userMap = new Map<string, string>();
  for (const u of allUsers ?? []) {
    userMap.set(u.id, u.full_name || u.email);
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  type ActivityLog = {
    id: string;
    user_id: string;
    action: string;
    path: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };

  return (
    <div>
      <Header title="User Activity" />
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link href="/admin/monitoring" className="hover:text-foreground transition-colors">Admin</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground font-medium">User Activity</span>
          </nav>
          <h2 className="text-2xl font-bold tracking-tight">User Activity</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Page visits and actions — {(count ?? 0).toLocaleString()} total records.
          </p>
        </div>

        {/* User filter */}
        <form method="get" className="flex items-center gap-3">
          <select
            name="userId"
            defaultValue={filterUserId ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All users</option>
            {(allUsers ?? []).map((u: { id: string; full_name: string | null; email: string }) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Filter
          </button>
          {filterUserId && (
            <Link href="/admin/monitoring/user-activity" className="text-sm text-muted-foreground hover:text-foreground">
              Clear
            </Link>
          )}
        </form>

        {(!logs || logs.length === 0) ? (
          <p className="text-sm text-muted-foreground">No activity logs yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-4 py-2 text-left font-medium">Date / Time</th>
                    <th className="px-4 py-2 text-left font-medium">User</th>
                    <th className="px-4 py-2 text-left font-medium">Action</th>
                    <th className="px-4 py-2 text-left font-medium">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs as ActivityLog[]).map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {new Date(log.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {userMap.get(log.user_id) ?? log.user_id}
                      </td>
                      <td className="px-4 py-2">{log.action}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {log.path ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-3 pt-2">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}${filterUserId ? `&userId=${filterUserId}` : ""}`}
                className="rounded border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Previous
              </Link>
            )}
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`?page=${page + 1}${filterUserId ? `&userId=${filterUserId}` : ""}`}
                className="rounded border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

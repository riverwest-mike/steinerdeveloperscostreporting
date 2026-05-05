export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

const PAGE_SIZE = 50;

export default async function ChatLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (me?.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  const { data: logs, count } = await supabase
    .from("chat_logs")
    .select("id, user_id, messages, response, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // Fetch user names
  const userIds = [...new Set((logs ?? []).map((l: { user_id: string }) => l.user_id))];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const u of users ?? []) {
      userMap.set(u.id, u.full_name || u.email);
    }
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  type ChatLog = {
    id: string;
    user_id: string;
    messages: Array<{ role: string; content: unknown }>;
    response: string | null;
    created_at: string;
  };

  return (
    <div>
      <Header title="Chat Log" />
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link href="/admin/monitoring" className="hover:text-foreground transition-colors">Admin</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground font-medium">Chat Log</span>
          </nav>
          <h2 className="text-2xl font-bold tracking-tight">Chat Log</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            All AI chat conversations — {(count ?? 0).toLocaleString()} total.
          </p>
        </div>

        {(!logs || logs.length === 0) ? (
          <p className="text-sm text-muted-foreground">No chat logs yet.</p>
        ) : (
          <div className="space-y-3">
            {(logs as ChatLog[]).map((log) => {
              const userMessages = log.messages.filter((m) => m.role === "user");
              const lastUserMsg = userMessages[userMessages.length - 1];
              const preview = typeof lastUserMsg?.content === "string"
                ? lastUserMsg.content.slice(0, 140)
                : Array.isArray(lastUserMsg?.content)
                ? String((lastUserMsg.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")?.text ?? "").slice(0, 140)
                : "";

              return (
                <div key={log.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm truncate">
                        {userMap.get(log.user_id) ?? log.user_id}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {log.messages.length} msg{log.messages.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {preview && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground">Q: </span>{preview}{preview.length >= 140 ? "…" : ""}
                    </p>
                  )}

                  {log.response && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground">A: </span>
                      {log.response.slice(0, 140)}{log.response.length > 140 ? "…" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center gap-3 pt-2">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
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
                href={`?page=${page + 1}`}
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

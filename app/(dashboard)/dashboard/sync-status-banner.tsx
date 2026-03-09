import Link from "next/link";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export interface SyncStatus {
  status: string;
  completed_at: string | null;
  records_upserted: number | null;
  error_message: string | null;
  sync_type: string;
}

function fmtRelative(isoString: string): string {
  const d = new Date(isoString);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function SyncStatusBanner({ sync }: { sync: SyncStatus | null }) {
  if (!sync) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
        <span>No AppFolio sync recorded yet.</span>
        <Link
          href="/admin/appfolio"
          className="ml-auto text-xs text-primary hover:underline flex-shrink-0"
        >
          Sync now →
        </Link>
      </div>
    );
  }

  const isRunning = sync.status === "running";
  const isFailed = sync.status === "failed";
  const isOk = sync.status === "completed";

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs ${
        isFailed
          ? "border-destructive/40 bg-destructive/5"
          : isRunning
          ? "border-blue-200 bg-blue-50"
          : "border-border bg-muted/30"
      }`}
    >
      {isRunning ? (
        <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin flex-shrink-0" />
      ) : isFailed ? (
        <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
      )}

      <span className="font-medium text-foreground">AppFolio Sync</span>

      {isRunning && (
        <span className="text-blue-700">Sync in progress…</span>
      )}

      {isOk && sync.completed_at && (
        <span className="text-muted-foreground">
          Completed {fmtRelative(sync.completed_at)}
          {sync.records_upserted != null && (
            <> &middot; {sync.records_upserted.toLocaleString()} records</>
          )}
        </span>
      )}

      {isFailed && (
        <span className="text-destructive truncate max-w-sm">
          {sync.error_message ?? "Sync failed"}
        </span>
      )}

      <Link
        href="/admin/appfolio"
        className="ml-auto text-xs text-primary hover:underline flex-shrink-0"
      >
        {isFailed ? "Retry sync →" : "Manage →"}
      </Link>
    </div>
  );
}

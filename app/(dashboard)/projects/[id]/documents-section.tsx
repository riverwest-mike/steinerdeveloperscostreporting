import Link from "next/link";

interface DocumentsSectionProps {
  projectId: string;
  documentCount: number;
}

export function DocumentsSection({ projectId, documentCount }: DocumentsSectionProps) {
  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Documents</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {documentCount} file{documentCount !== 1 ? "s" : ""}
          </span>
        </div>
        <Link
          href={`/projects/${projectId}/documents`}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Manage Documents
        </Link>
      </div>

      {documentCount === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No documents uploaded yet.
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          <Link
            href={`/projects/${projectId}/documents`}
            className="hover:text-foreground transition-colors"
          >
            View all {documentCount} document{documentCount !== 1 ? "s" : ""} →
          </Link>
        </div>
      )}
    </div>
  );
}

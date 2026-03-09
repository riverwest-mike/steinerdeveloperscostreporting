import Link from "next/link";

interface VendorsSectionProps {
  projectId: string;
  activeCount: number;
  totalCount: number;
  recentVendors: string[];
}

export function VendorsSection({ projectId, activeCount, totalCount, recentVendors }: VendorsSectionProps) {
  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Vendors</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {activeCount} active
          </span>
          {totalCount > activeCount && (
            <span className="text-xs text-muted-foreground">
              ({totalCount - activeCount} inactive)
            </span>
          )}
        </div>
        <Link
          href={`/projects/${projectId}/vendors`}
          className="rounded border px-3 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          Manage Vendors
        </Link>
      </div>

      {recentVendors.length > 0 ? (
        <div className="px-4 py-3 flex flex-wrap gap-1.5">
          {recentVendors.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {name}
            </span>
          ))}
          {activeCount > recentVendors.length && (
            <Link
              href={`/projects/${projectId}/vendors`}
              className="inline-flex items-center rounded-full bg-muted/50 border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              +{activeCount - recentVendors.length} more
            </Link>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No vendors yet. Vendors are added automatically when AppFolio syncs or when contracts are entered.
        </div>
      )}
    </div>
  );
}

import Link from "next/link";

export interface COIAlert {
  vendor_name: string;
  display_name: string;
  expiration_date: string;
  days_until_expiry: number;
  coverage_type: string | null;
  project_id: string | null;
  project_name: string | null;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function COIAlerts({ alerts }: { alerts: COIAlert[] }) {
  if (alerts.length === 0) return null;

  const expired = alerts.filter((a) => a.days_until_expiry < 0);
  const expiringSoon = alerts.filter((a) => a.days_until_expiry >= 0);

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-lg font-semibold">COI Compliance Alerts</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {expired.length > 0 && `${expired.length} expired`}
          {expired.length > 0 && expiringSoon.length > 0 && " · "}
          {expiringSoon.length > 0 && `${expiringSoon.length} expiring within 60 days`}
        </p>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-left font-medium">Document</th>
                <th className="px-3 py-2 text-left font-medium">Coverage</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Expires</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, i) => {
                const isExpired = alert.days_until_expiry < 0;
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/vendors/${encodeURIComponent(alert.vendor_name)}`}
                        className="hover:underline hover:text-primary transition-colors"
                      >
                        {alert.vendor_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">
                      {alert.display_name}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {alert.coverage_type ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      <span className={isExpired ? "text-destructive font-medium" : "text-amber-700 font-medium"}>
                        {fmtDate(alert.expiration_date)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isExpired
                            ? "bg-red-100 text-red-800"
                            : alert.days_until_expiry <= 30
                            ? "bg-orange-100 text-orange-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isExpired
                          ? `Expired ${Math.abs(alert.days_until_expiry)}d ago`
                          : alert.days_until_expiry === 0
                          ? "Expires today"
                          : `${alert.days_until_expiry}d left`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

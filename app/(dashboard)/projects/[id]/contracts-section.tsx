import Link from "next/link";

interface Contract {
  id: string;
  vendor_name: string;
  contract_number: string | null;
  description: string;
  original_value: number;
  approved_co_amount: number;
  revised_value: number;
  status: string;
  gate_id: string | null;
  cost_category_id: string;
  gate_names?: string;
  category_name?: string;
}

interface ContractsSectionProps {
  projectId: string;
  contracts: Contract[];
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  complete: "bg-blue-100 text-blue-800",
  terminated: "bg-red-100 text-red-700",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ContractsSection({ projectId, contracts }: ContractsSectionProps) {
  return (
    <div className="rounded-lg border mt-6">
      <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Contracts</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {contracts.length}
          </span>
        </div>
        <Link
          href={`/projects/${projectId}/contracts/new`}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + Add Contract
        </Link>
      </div>

      {contracts.length > 0 ? (
        <div className="max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white sticky top-0">
                <th className="px-4 py-2.5 text-left text-xs font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium hidden md:table-cell">Contract #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium hidden lg:table-cell">Gates</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium hidden lg:table-cell">Category</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium hidden sm:table-cell">Original</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium hidden md:table-cell">Approved COs</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium">Revised</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/projects/${projectId}/contracts/${c.id}`}
                      className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      {c.vendor_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">
                    {c.contract_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{c.gate_names ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{c.category_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs hidden sm:table-cell">{fmtCurrency(c.original_value)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                    {c.approved_co_amount !== 0 ? fmtCurrency(c.approved_co_amount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-medium">{fmtCurrency(c.revised_value)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-4 py-2.5 text-xs">Total ({contracts.length})</td>
                <td className="hidden md:table-cell" />
                <td className="hidden lg:table-cell" />
                <td className="hidden lg:table-cell" />
                <td className="px-4 py-2.5 text-right font-mono text-xs hidden sm:table-cell">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.original_value, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground hidden md:table-cell">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.approved_co_amount, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">
                  {fmtCurrency(contracts.reduce((s, c) => s + c.revised_value, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          No contracts yet.{" "}
          <Link href={`/projects/${projectId}/contracts/new`} className="text-primary hover:underline underline-offset-2">
            Add the first contract
          </Link>{" "}
          to track commitments.
        </div>
      )}
    </div>
  );
}

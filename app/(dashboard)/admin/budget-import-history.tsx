import { LocalTime } from "@/components/local-time";

interface BudgetImport {
  id: string;
  project_id: string | null;
  gate_id: string | null;
  filename: string;
  row_count: number | null;
  imported_at: string;
  imported_by: string | null;
  notes: string | null;
}

interface Props {
  imports: BudgetImport[];
  projectMap: Map<string, { name: string; code: string }>;
  userMap: Map<string, { full_name: string; email: string }>;
  gateMap: Map<string, { name: string }>;
}

export function BudgetImportHistory({ imports, projectMap, userMap, gateMap }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Budget Import History</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Excel gate budget uploads — most recent first.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{imports.length} record{imports.length !== 1 ? "s" : ""}</span>
      </div>

      {imports.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No budget imports yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Imported</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Gate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">File</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Rows</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Imported By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const project = imp.project_id ? projectMap.get(imp.project_id) : null;
                const gate = imp.gate_id ? gateMap.get(imp.gate_id) : null;
                const importer = imp.imported_by ? userMap.get(imp.imported_by) : null;

                return (
                  <tr key={imp.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                      <LocalTime iso={imp.imported_at} timeClassName="text-[10px]" />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {project ? (
                        <span>
                          <span className="font-mono font-semibold mr-1">{project.code}</span>
                          {project.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {gate?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-48 truncate" title={imp.filename}>
                      {imp.filename}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {imp.row_count?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {importer ? (
                        <span>{importer.full_name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {imp.notes ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

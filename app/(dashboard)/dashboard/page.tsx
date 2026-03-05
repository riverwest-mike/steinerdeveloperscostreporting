export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { TimeGreeting } from "@/components/time-greeting";
import { RecentBills, type BillRow } from "./recent-bills";

export default async function DashboardPage() {
  const { userId } = await auth();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", userId!)
    .single();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, appfolio_property_id")
    .order("name");

  // Build property_id → project name map for bill display
  const propertyToProject = new Map<string, string>();
  for (const p of projects ?? []) {
    if (p.appfolio_property_id) {
      propertyToProject.set(p.appfolio_property_id, p.name);
    }
  }

  // Fetch last 30 days of AppFolio transactions (max window — client filters down from here)
  const thirtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rawBills } = await adminSupabase
    .from("appfolio_transactions")
    .select("id, bill_date, vendor_name, cost_category_code, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description")
    .gte("bill_date", thirtyDaysAgo)
    .order("bill_date", { ascending: false })
    .limit(500);

  const bills: BillRow[] = (rawBills ?? []).map((b) => ({
    id: String(b.id),
    bill_date: b.bill_date,
    vendor_name: b.vendor_name,
    cost_category_code: b.cost_category_code,
    cost_category_name: b.cost_category_name,
    paid_amount: Number(b.paid_amount),
    unpaid_amount: Number(b.unpaid_amount),
    payment_status: b.payment_status,
    project_name: propertyToProject.get(b.appfolio_property_id) ?? null,
    description: b.description,
  }));

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            <TimeGreeting name={user?.full_name} />
          </h2>
          <p className="text-muted-foreground mt-1">
            Here&apos;s an overview of your construction projects.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Active Projects
            </div>
            <div className="mt-2 text-3xl font-bold">
              {projects?.filter((p) => p.status === "active").length ?? 0}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Total Projects
            </div>
            <div className="mt-2 text-3xl font-bold">
              {projects?.length ?? 0}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">
              Your Role
            </div>
            <div className="mt-2 text-lg font-bold capitalize">
              {user?.role?.replace("_", " ") ?? "—"}
            </div>
          </div>
        </div>

        {/* Recent bills from AppFolio */}
        <RecentBills bills={bills} />

        {/* Projects table */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Projects</h3>
          {projects && projects.length > 0 ? (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Code</th>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">
                        {project.code}
                      </td>
                      <td className="px-4 py-3">{project.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            project.status === "active"
                              ? "bg-green-100 text-green-800"
                              : project.status === "on_hold"
                              ? "bg-yellow-100 text-yellow-800"
                              : project.status === "completed"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {project.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                No projects yet. An admin will create your first project.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

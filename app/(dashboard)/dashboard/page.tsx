export const dynamic = "force-dynamic";

import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { TimeGreeting } from "@/components/time-greeting";
import { RecentBills, type BillRow } from "./recent-bills";

interface RawBill {
  id: string | number;
  bill_date: string;
  vendor_name: string;
  cost_category_code: string | null;
  cost_category_name: string | null;
  paid_amount: number;
  unpaid_amount: number;
  payment_status: string;
  appfolio_property_id: string;
  description: string | null;
}

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
    .select("id, name, code, status, appfolio_property_id, image_url")
    .order("name");

  // Build property_id → project name map for bill display
  const propertyToProject = new Map<string, string>();
  for (const p of projects ?? []) {
    if (p.appfolio_property_id) {
      propertyToProject.set(p.appfolio_property_id, p.name);
    }
  }

  // Fetch last 30 days of AppFolio transactions (max window — client filters down)
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

  const bills: BillRow[] = ((rawBills ?? []) as RawBill[]).map((b) => ({
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

  const activeProjects = (projects ?? []).filter((p) => p.status === "active");

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
            <div className="text-sm font-medium text-muted-foreground">Active Projects</div>
            <div className="mt-2 text-3xl font-bold">{activeProjects.length}</div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Projects</div>
            <div className="mt-2 text-3xl font-bold">{projects?.length ?? 0}</div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Your Role</div>
            <div className="mt-2 text-lg font-bold capitalize">
              {user?.role?.replace("_", " ") ?? "—"}
            </div>
          </div>
        </div>

        {/* Recent bills from AppFolio */}
        <RecentBills bills={bills} />

        {/* Project list */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Projects</h3>
          {projects && projects.length > 0 ? (
            <div className="rounded-lg border divide-y">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Thumbnail — only shown when image_url exists */}
                  {project.image_url ? (
                    <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded">
                      <Image
                        src={project.image_url}
                        alt={project.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                  ) : (
                    <div className="h-10 w-14 flex-shrink-0 rounded bg-muted" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{project.code}</p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${
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
                </div>
              ))}
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

export const dynamic = "force-dynamic";

import Link from "next/link";
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

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-600",
};

export default async function DashboardPage() {
  const { userId } = await auth();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", userId!)
    .single();

  // RLS on createClient() ensures only projects this user is assigned to are returned
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code, status, appfolio_property_id, image_url")
    .order("name");

  const activeProjects = (projects ?? []).filter((p) => p.status === "active");

  // Build a set of property IDs this user can see — used to screen bills
  const accessiblePropertyIds = new Set<string>(
    (projects ?? [])
      .filter((p) => p.appfolio_property_id)
      .map((p) => p.appfolio_property_id as string)
  );

  // property_id → project name for bill display
  const propertyToProject = new Map<string, string>();
  for (const p of projects ?? []) {
    if (p.appfolio_property_id) {
      propertyToProject.set(p.appfolio_property_id, p.name);
    }
  }

  // Fetch up to 90 days — wide enough for all client-side filter options
  const ninetyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rawBills } = await adminSupabase
    .from("appfolio_transactions")
    .select(
      "id, bill_date, vendor_name, cost_category_code, cost_category_name, paid_amount, unpaid_amount, payment_status, appfolio_property_id, description"
    )
    .gte("bill_date", ninetyDaysAgo)
    .order("bill_date", { ascending: false })
    .limit(1000);

  // Only surface bills for properties this user is actually assigned to
  const bills: BillRow[] = ((rawBills ?? []) as RawBill[])
    .filter((b) => accessiblePropertyIds.has(b.appfolio_property_id))
    .map((b) => ({
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

        {/* Top stats + embedded project list */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Active projects — spans 2 cols on large screens; project list lives here */}
          <div className="lg:col-span-2 rounded-lg border bg-card flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <span className="text-sm font-medium text-muted-foreground">Active Projects</span>
              <span className="text-3xl font-bold">{activeProjects.length}</span>
            </div>

            {projects && projects.length > 0 ? (
              <ul className="divide-y flex-1">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                    >
                      {/* Small thumbnail */}
                      {project.image_url ? (
                        <div className="relative h-9 w-12 flex-shrink-0 overflow-hidden rounded">
                          <Image
                            src={project.image_url}
                            alt={project.name}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>
                      ) : (
                        <div className="h-9 w-12 flex-shrink-0 rounded bg-muted" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm leading-tight truncate">
                          {project.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {project.code}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${
                          STATUS_STYLES[project.status] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No projects assigned yet.
                </p>
              </div>
            )}
          </div>

          {/* Right column — total + role */}
          <div className="flex flex-col gap-4">
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
        </div>

        {/* Recent bills — scoped to user's accessible projects */}
        <RecentBills bills={bills} />
      </div>
    </div>
  );
}

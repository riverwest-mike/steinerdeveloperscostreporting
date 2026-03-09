export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { VendorSearch } from "./vendor-search";

interface VendorRow {
  name: string;
  is_active: boolean;
  project_id: string;
}

interface ProjectRow {
  id: string;
  name: string;
  code: string;
}

interface Props {
  searchParams: { q?: string };
}

export default async function VendorDirectoryPage({ searchParams }: Props) {
  const supabase = createAdminClient();
  const userId = (await headers()).get("x-clerk-user-id");
  const searchQuery = (searchParams.q ?? "").trim();

  const { data: userRow } = userId
    ? await supabase.from("users").select("role").eq("id", userId).single()
    : { data: null };
  const role = (userRow as { role?: string } | null)?.role ?? "read_only";

  const [{ data: rawVendors }, { data: rawProjects }] = await Promise.all([
    supabase
      .from("project_vendors")
      .select("name, is_active, project_id")
      .order("name"),
    supabase
      .from("projects")
      .select("id, name, code")
      .order("name"),
  ]);

  const vendors = (rawVendors ?? []) as VendorRow[];
  const projects = (rawProjects ?? []) as ProjectRow[];

  // For read_only users, restrict to assigned projects
  let allowedProjectIds: Set<string> | null = null;
  if (role === "read_only" && userId) {
    const { data: access } = await supabase
      .from("project_users")
      .select("project_id")
      .eq("user_id", userId);
    allowedProjectIds = new Set((access ?? []).map((a: { project_id: string }) => a.project_id));
  }

  // Group vendors by name across projects
  const vendorMap = new Map<string, { projectIds: Set<string>; hasActive: boolean }>();
  for (const v of vendors) {
    if (allowedProjectIds && !allowedProjectIds.has(v.project_id)) continue;
    if (!vendorMap.has(v.name)) {
      vendorMap.set(v.name, { projectIds: new Set(), hasActive: false });
    }
    const entry = vendorMap.get(v.name)!;
    entry.projectIds.add(v.project_id);
    if (v.is_active) entry.hasActive = true;
  }

  const allVendors = Array.from(vendorMap.entries())
    .map(([name, data]) => ({
      name,
      projectCount: data.projectIds.size,
      hasActive: data.hasActive,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Apply search filter
  const vendorList = searchQuery
    ? allVendors.filter((v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allVendors;

  const activeCount = allVendors.filter((v) => v.hasActive).length;
  const inactiveCount = allVendors.filter((v) => !v.hasActive).length;

  return (
    <div>
      <Header title="Vendor Directory" />
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">All Vendors</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {allVendors.length} vendor{allVendors.length !== 1 ? "s" : ""} across {projects.length} project{projects.length !== 1 ? "s" : ""}.
              {" "}<span className="text-green-700 font-medium">{activeCount} active</span>
              {inactiveCount > 0 && <span className="text-muted-foreground">, {inactiveCount} inactive</span>}.
            </p>
          </div>
          <Link
            href="/reports/vendor-detail"
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors shrink-0"
          >
            Vendor Detail Report →
          </Link>
        </div>

        {/* Search bar */}
        <div className="mb-4">
          <Suspense fallback={null}>
            <VendorSearch initialValue={searchQuery} />
          </Suspense>
        </div>

        {searchQuery && (
          <p className="text-sm text-muted-foreground mb-3">
            {vendorList.length === 0
              ? `No vendors match "${searchQuery}"`
              : `${vendorList.length} vendor${vendorList.length !== 1 ? "s" : ""} matching "${searchQuery}"`}
          </p>
        )}

        {vendorList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-16 text-center">
            <p className="text-muted-foreground text-sm">
              {searchQuery ? `No vendors match "${searchQuery}".` : "No vendors found."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white text-xs">
                  <th className="px-4 py-2.5 text-left font-medium">Vendor Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Projects</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vendorList.map((v) => (
                  <tr key={v.name} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/vendors/${encodeURIComponent(v.name)}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {v.projectCount} project{v.projectCount !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          v.hasActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.hasActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/vendors/${encodeURIComponent(v.name)}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

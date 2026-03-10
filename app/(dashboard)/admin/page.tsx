export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Users, Tag, RefreshCw, ScrollText, ArrowRight } from "lucide-react";
import { HELP } from "@/lib/help";

const ADMIN_SECTIONS = [
  {
    href: "/admin/users",
    title: "Users & Access",
    description: "Manage user accounts, roles, and project assignments. Invite new users and control who can access which projects.",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    href: "/admin/cost-categories",
    title: "Cost Categories",
    description: "Define and manage cost codes used across all projects and gate budgets. Load seed data or create custom categories.",
    icon: Tag,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    href: "/admin/appfolio",
    title: "AppFolio Integration",
    description: "Sync AppFolio transaction data, manage property-to-project mappings, and review sync history.",
    icon: RefreshCw,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    href: "/admin/audit-log",
    title: "Audit Log",
    description: "Review all user-initiated changes across projects, gates, contracts, and change orders.",
    icon: ScrollText,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
];

export default async function AdminPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", userId!)
    .single();

  const role = user?.role;
  if (role !== "admin" && role !== "accounting") {
    redirect("/dashboard");
  }

  const visibleSections = role === "accounting"
    ? ADMIN_SECTIONS.filter((s) => s.href !== "/admin/users")
    : ADMIN_SECTIONS;

  return (
    <div>
      <Header title="Admin" helpContent={HELP.adminIndex} />
      <div className="p-4 sm:p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Admin Panel</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage users, cost categories, integrations, and system settings.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/40"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`rounded-lg p-2.5 ${section.bg}`}>
                  <section.icon className={`h-5 w-5 ${section.color}`} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
              <h3 className="font-semibold text-base mb-1">{section.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

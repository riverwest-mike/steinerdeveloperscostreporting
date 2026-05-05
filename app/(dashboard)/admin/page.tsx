export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Users, Tag, RefreshCw, ScrollText } from "lucide-react";
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
  if (role !== "admin" && role !== "accounting" && role !== "development_lead") {
    redirect("/dashboard");
  }

  const visibleSections = role === "accounting"
    ? ADMIN_SECTIONS.filter((s) => s.href !== "/admin/users")
    : ADMIN_SECTIONS;

  return (
    <div>
      <Header title="Settings" helpContent={HELP.adminIndex} />
      <div className="p-4 sm:p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage users, cost categories, integrations, and system settings.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
          {visibleSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-start gap-4 rounded-lg border p-5 hover:bg-accent hover:border-primary/30 transition-colors h-full"
            >
              <div className={`mt-0.5 rounded-md border p-2 transition-colors shrink-0 ${section.bg} group-hover:opacity-90`}>
                <section.icon className={`h-5 w-5 ${section.color}`} />
              </div>
              <div>
                <p className="font-semibold group-hover:text-primary transition-colors">
                  {section.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {section.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { MessageSquare, Activity, Cpu, ArrowRight } from "lucide-react";

const SECTIONS = [
  {
    href: "/admin/monitoring/chat-log",
    title: "Chat Log",
    description: "Every AI chat conversation — user, date/time, messages sent and received.",
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    href: "/admin/monitoring/user-activity",
    title: "User Activity",
    description: "Page visits and actions taken across the application, by user and timestamp.",
    icon: Activity,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    href: "/admin/monitoring/ai-usage",
    title: "AI Usage",
    description: "Token consumption and cost per AI request, broken down by user and date.",
    icon: Cpu,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
];

export default async function MonitoringPage() {
  const userId = (await headers()).get("x-clerk-user-id");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId!)
    .single();

  if (user?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div>
      <Header title="Admin" />
      <div className="p-4 sm:p-6">
        <div className="mb-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <span className="text-foreground font-medium">Admin</span>
          </nav>
          <h2 className="text-2xl font-bold tracking-tight">Admin</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            System monitoring — chat logs, user activity, and AI usage.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
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

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { MessageSquare, Activity, Cpu } from "lucide-react";

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

        <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
          {SECTIONS.map((section) => (
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

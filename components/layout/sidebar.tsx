"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  BarChart3,
  ShieldCheck,
  ChevronDown,
  FileBarChart2,
} from "lucide-react";
import { useState } from "react";

const adminNavItems = [
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

const reportItems = [
  { href: "/reports/cost-management", label: "Project Cost Management" },
  { href: "/reports/cost-detail", label: "Cost Detail" },
  { href: "/reports/balance-sheet", label: "Balance Sheet" },
];

interface SidebarProps {
  role: string;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/reports"));

  const reportsActive = pathname.startsWith("/reports");

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-bold tracking-tight">
          Steiner Developers Cost Tracker
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/dashboard"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        {/* Projects */}
        <Link
          href="/projects"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/projects")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <FolderKanban className="h-4 w-4" />
          Projects
        </Link>

        {/* Reports — expandable */}
        <div>
          <button
            onClick={() => setReportsOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              reportsActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Reports</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                reportsOpen && "rotate-180"
              )}
            />
          </button>

          {reportsOpen && (
            <div className="mt-1 ml-3 space-y-0.5 border-l pl-3">
              {reportItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    pathname.startsWith(item.href)
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <FileBarChart2 className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Admin */}
        {isAdmin &&
          adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
      </nav>

      {/* Role badge at bottom */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground capitalize">
            {role?.replace("_", " ")}
          </span>
        </div>
      </div>
    </aside>
  );
}

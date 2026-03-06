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
  Users,
  Tag,
  RefreshCw,
  ScrollText,
  BookOpen,
} from "lucide-react";
import { useState } from "react";

const reportItems = [
  { href: "/reports/cost-management", label: "Project Cost Management" },
  { href: "/reports/cost-detail", label: "Cost Detail" },
  { href: "/reports/vendor-detail", label: "Vendor Detail" },
  { href: "/reports/commitment-detail", label: "Commitment Detail" },
  { href: "/reports/change-orders", label: "Change Order Log" },
  { href: "/reports/balance-sheet", label: "Balance Sheet" },
];

const adminItems = [
  { href: "/admin/users", label: "Users & Access", icon: Users },
  { href: "/admin/cost-categories", label: "Cost Categories", icon: Tag },
  { href: "/admin/appfolio", label: "AppFolio", icon: RefreshCw },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
];

interface SidebarProps {
  role: string;
  onClose?: () => void;
}

export function Sidebar({ role, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/reports"));
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith("/admin"));

  const reportsActive = pathname.startsWith("/reports");
  const adminActive = pathname.startsWith("/admin");

  function navItem(active: boolean) {
    return cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-[hsl(var(--sidebar-active-bg))] text-white"
        : "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-white"
    );
  }

  function subItem(active: boolean) {
    return cn(
      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
      active
        ? "font-semibold text-white"
        : "text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))]"
    );
  }

  return (
    <aside
      className="flex h-full w-64 flex-col print:hidden"
      style={{ background: "hsl(var(--sidebar-bg))" }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-2.5 px-5 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--sidebar-active-bg))]">
          <span className="text-xs font-black text-white leading-none">SD</span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight text-white truncate">
            Steiner Developers
          </p>
          <p className="text-[10px] leading-tight" style={{ color: "hsl(var(--sidebar-muted))" }}>
            Cost Tracker
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">

        <Link href="/dashboard" className={navItem(pathname === "/dashboard")} onClick={onClose}>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </Link>

        <Link href="/projects" className={navItem(pathname.startsWith("/projects"))} onClick={onClose}>
          <FolderKanban className="h-4 w-4 shrink-0" />
          Projects
        </Link>

        <div className="my-2" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />

        {/* Reports */}
        <div>
          <Link
            href="/reports"
            onClick={() => { setReportsOpen(true); onClose?.(); }}
            className={navItem(reportsActive)}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="flex-1">Reporting</span>
            <ChevronDown
              onClick={(e) => { e.preventDefault(); setReportsOpen((o) => !o); }}
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", reportsOpen && "rotate-180")}
              style={{ color: "hsl(var(--sidebar-muted))" }}
            />
          </Link>

          {reportsOpen && (
            <div
              className="mt-1 ml-4 space-y-0.5 pl-3"
              style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
            >
              {reportItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={subItem(pathname.startsWith(item.href))}
                >
                  <FileBarChart2 className="h-3 w-3 shrink-0 opacity-60" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Admin */}
        {isAdmin && (
          <>
            <div className="my-2" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />
            <div>
              <Link
                href="/admin"
                onClick={() => { setAdminOpen(true); onClose?.(); }}
                className={navItem(adminActive)}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="flex-1">Admin</span>
                <ChevronDown
                  onClick={(e) => { e.preventDefault(); setAdminOpen((o) => !o); }}
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", adminOpen && "rotate-180")}
                  style={{ color: "hsl(var(--sidebar-muted))" }}
                />
              </Link>

              {adminOpen && (
                <div
                  className="mt-1 ml-4 space-y-0.5 pl-3"
                  style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
                >
                  {adminItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={subItem(pathname.startsWith(item.href))}
                    >
                      <item.icon className="h-3 w-3 shrink-0 opacity-60" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className="shrink-0 p-4 space-y-2"
        style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "hsl(var(--sidebar-active-bg))" }}
          />
          <span className="text-[11px] capitalize" style={{ color: "hsl(var(--sidebar-muted))" }}>
            {role?.replace("_", " ")}
          </span>
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("open-quickstart"))}
          className="flex w-full items-center gap-1.5 text-[11px] transition-colors hover:text-white"
          style={{ color: "hsl(var(--sidebar-muted))" }}
        >
          <BookOpen className="h-3 w-3 shrink-0" />
          Quick Start Guide
        </button>
      </div>
    </aside>
  );
}

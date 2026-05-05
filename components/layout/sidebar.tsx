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
  Building2,
  MessageSquare,
  Activity,
  Cpu,
  Lock,
} from "lucide-react";
import { KilnLockup } from "@/components/brand/kiln-logo";
import { useState } from "react";

const reportItems = [
  { href: "/reports/cost-management", label: "Project Cost Management" },
  { href: "/reports/cost-detail", label: "Cost Detail" },
  { href: "/reports/vendor-detail", label: "Vendor Detail" },
  { href: "/reports/commitment-detail", label: "Commitment Detail" },
  { href: "/reports/change-orders", label: "Change Order Log" },
  { href: "/reports/balance-sheet", label: "Balance Sheet" },
];

// Settings section (admin + accounting + development_lead)
const settingsItems = [
  { href: "/admin/users", label: "Users & Access", icon: Users },
  { href: "/admin/cost-categories", label: "Cost Categories", icon: Tag },
  { href: "/admin/appfolio", label: "AppFolio", icon: RefreshCw },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
];

// Admin section (true admin only)
const systemAdminItems = [
  { href: "/admin/monitoring/chat-log", label: "Chat Log", icon: MessageSquare },
  { href: "/admin/monitoring/user-activity", label: "User Activity", icon: Activity },
  { href: "/admin/monitoring/ai-usage", label: "AI Usage", icon: Cpu },
];

const SETTINGS_PATHS = ["/admin/users", "/admin/cost-categories", "/admin/appfolio", "/admin/audit-log"];
const SYSTEM_ADMIN_PATHS = ["/admin/monitoring"];

interface SidebarProps {
  role: string;
  onClose?: () => void;
}

export function Sidebar({ role, onClose }: SidebarProps) {
  const pathname = usePathname();
  const showSettingsSection = role === "admin" || role === "accounting" || role === "development_lead";
  const showSystemAdminSection = role === "admin";

  const visibleSettingsItems = role === "accounting"
    ? settingsItems.filter((item) => item.href !== "/admin/users")
    : settingsItems;

  const settingsActive = pathname === "/admin" || SETTINGS_PATHS.some((p) => pathname.startsWith(p));
  const systemAdminActive = SYSTEM_ADMIN_PATHS.some((p) => pathname.startsWith(p));

  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/reports"));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  const [systemAdminOpen, setSystemAdminOpen] = useState(systemAdminActive);

  const reportsActive = pathname.startsWith("/reports");

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
        className="flex h-16 items-center px-5 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
      >
        <KilnLockup endorsed size="md" invert />
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

        <Link href="/vendors" className={navItem(pathname.startsWith("/vendors"))} onClick={onClose}>
          <Building2 className="h-4 w-4 shrink-0" />
          Vendors
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

        {/* Settings (admin + accounting + development_lead) */}
        {showSettingsSection && (
          <>
            <div className="my-2" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />
            <div>
              <Link
                href="/admin"
                onClick={() => { setSettingsOpen(true); onClose?.(); }}
                className={navItem(settingsActive)}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="flex-1">Settings</span>
                <ChevronDown
                  onClick={(e) => { e.preventDefault(); setSettingsOpen((o) => !o); }}
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", settingsOpen && "rotate-180")}
                  style={{ color: "hsl(var(--sidebar-muted))" }}
                />
              </Link>

              {settingsOpen && (
                <div
                  className="mt-1 ml-4 space-y-0.5 pl-3"
                  style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
                >
                  {visibleSettingsItems.map((item) => (
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

        {/* Admin monitoring (true admin only) */}
        {showSystemAdminSection && (
          <>
            <div className="my-2" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />
            <div>
              <Link
                href="/admin/monitoring"
                onClick={() => { setSystemAdminOpen(true); onClose?.(); }}
                className={navItem(systemAdminActive)}
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span className="flex-1">Admin</span>
                <ChevronDown
                  onClick={(e) => { e.preventDefault(); setSystemAdminOpen((o) => !o); }}
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", systemAdminOpen && "rotate-180")}
                  style={{ color: "hsl(var(--sidebar-muted))" }}
                />
              </Link>

              {systemAdminOpen && (
                <div
                  className="mt-1 ml-4 space-y-0.5 pl-3"
                  style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
                >
                  {systemAdminItems.map((item) => (
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
            {role?.replace(/_/g, " ")}
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

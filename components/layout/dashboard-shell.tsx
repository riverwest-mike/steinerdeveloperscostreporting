"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { QuickStartTrigger } from "@/components/quickstart/quickstart-trigger";
import { AiChatWidget } from "@/components/ai-chat-widget";
import { ActivityTracker } from "@/components/activity-tracker";

export function DashboardShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const openDrawer = useCallback(() => setMobileOpen(true), []);
  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    window.addEventListener("open-mobile-nav", openDrawer);
    return () => window.removeEventListener("open-mobile-nav", openDrawer);
  }, [openDrawer]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Desktop sidebar — always visible on md+ */}
      <div className="hidden md:flex h-full print:hidden">
        <Sidebar role={role} />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          {/* Slide-in drawer */}
          <div className="relative h-full w-64 animate-in slide-in-from-left-2 duration-200">
            <Sidebar role={role} onClose={closeDrawer} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 print:block print:overflow-visible">
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          {children}
          <footer className="border-t mt-8 px-4 sm:px-6 py-3 text-[11px] text-muted-foreground flex items-center justify-between print:hidden">
            <span>
              <span className="font-semibold tracking-tight">KILN</span> by RiverWest
            </span>
            <span>kilnhq.com</span>
          </footer>
        </main>
      </div>

      <ActivityTracker />
      <QuickStartTrigger />
      <AiChatWidget />
    </div>
  );
}

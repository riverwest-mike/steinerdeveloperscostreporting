"use client";

import { useState, useEffect, useCallback } from "react";
import { HelpCircle, X, Lightbulb, ChevronRight } from "lucide-react";

export interface HelpSection {
  heading: string;
  body: string;
}

export interface HelpAction {
  label: string;
  desc: string;
}

export interface PageHelpContent {
  title: string;
  description: string;
  sections?: HelpSection[];
  actions?: HelpAction[];
  tip?: string;
}

interface PageHelpProps {
  content: PageHelpContent;
}

export function PageHelp({ content }: PageHelpProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Page help"
        title="Help for this page"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary hover:bg-primary/5 print:hidden"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* Backdrop + modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6 bg-black/20 backdrop-blur-sm print:hidden"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <HelpCircle className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm text-foreground leading-tight">{content.title}</h2>
                  <p className="text-[11px] text-muted-foreground">Page Help</p>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close help"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Overview */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {content.description}
              </p>

              {/* Key actions */}
              {content.actions && content.actions.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Key Actions
                  </h3>
                  <div className="divide-y rounded-lg border overflow-hidden">
                    {content.actions.map((a) => (
                      <div key={a.label} className="flex gap-3 px-3 py-2.5 bg-card hover:bg-muted/30 transition-colors">
                        <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">{a.label}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{a.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              {content.sections && content.sections.map((s) => (
                <div key={s.heading} className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {s.heading}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              ))}

              {/* Tip */}
              {content.tip && (
                <div className="flex gap-2.5 rounded-lg bg-primary/8 border border-primary/20 px-3.5 py-3 text-sm">
                  <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-muted-foreground leading-relaxed">{content.tip}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-5 py-3 bg-muted/30 rounded-b-xl shrink-0">
              <button
                onClick={() => {
                  close();
                  setTimeout(() => window.dispatchEvent(new Event("open-quickstart")), 100);
                }}
                className="text-xs text-primary hover:underline underline-offset-2"
              >
                Open full Quick Start Guide →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

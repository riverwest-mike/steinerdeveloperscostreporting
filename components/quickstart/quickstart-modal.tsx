"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, LayoutDashboard, FolderKanban, BarChart3, BookOpen } from "lucide-react";

/* ─── Screenshot helper ────────────────────────────────── */
// Place real screenshots at /public/guide/screenshot-*.png
// Until then, a styled placeholder is shown automatically.
function Screenshot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="my-4">
      {failed ? (
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 h-48 text-slate-400 text-sm">
          {alt}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="w-full rounded-lg border border-slate-200 shadow-sm"
        />
      )}
      {caption && (
        <figcaption className="mt-1.5 text-center text-xs text-muted-foreground italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ─── Hint box ─────────────────────────────────────────── */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
      <span className="shrink-0 font-bold">💡</span>
      <span>{children}</span>
    </div>
  );
}

/* ─── Section content ─────────────────────────────────── */

const sections = [
  {
    title: "Welcome to Steiner Developers Cost Tracker",
    icon: <BookOpen className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-base text-slate-700 leading-relaxed">
          This tool gives you a single, real-time view of every construction project&apos;s
          budget, commitments, and costs — from approved gate budgets through to AppFolio-synced
          actuals, all in one place.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {[
            { icon: "📁", title: "Projects & Gates", desc: "Organize projects into approval phases (gates), each with its own cost-category budget." },
            { icon: "📄", title: "Contracts & SOV", desc: "Enter contracts with a Schedule of Values so committed dollars map to the right cost code." },
            { icon: "📊", title: "Reports", desc: "Run the Project Cost Management report to see budget vs. committed vs. incurred — drillable down to individual transactions." },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border bg-slate-50 p-4">
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="font-semibold text-sm text-slate-800 mb-1">{card.title}</div>
              <div className="text-xs text-slate-600 leading-relaxed">{card.desc}</div>
            </div>
          ))}
        </div>

        <Screenshot
          src="/guide/screenshot-dashboard.png"
          alt="Dashboard overview"
          caption="The Dashboard gives a quick summary of active projects and your role."
        />

        <Hint>
          This guide stays accessible at any time — look for the &ldquo;Quick Start Guide&rdquo; link at
          the very bottom of the left-hand menu.
        </Hint>
      </div>
    ),
  },
  {
    title: "Navigating the App",
    icon: <LayoutDashboard className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The left sidebar is your main navigation. It stays visible on every page.
        </p>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-2 text-left font-medium">Menu Item</th>
                <th className="px-4 py-2 text-left font-medium">What it&apos;s for</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { item: "Dashboard", desc: "High-level project summary and your role" },
                { item: "Projects", desc: "All projects you have access to — click any project to see its gates and contracts" },
                { item: "Reports › Project Cost Management", desc: "The main financial report: budget vs. committed vs. incurred by cost category" },
                { item: "Reports › Cost Detail", desc: "Line-by-line AppFolio transactions filtered by project, cost category, or payment status" },
                { item: "Reports › Vendor Detail", desc: "Transactions grouped by vendor across any project" },
                { item: "Reports › Commitment Detail", desc: "All contracts that make up the committed amounts in the PCM report" },
                { item: "Reports › Balance Sheet", desc: "AppFolio balance sheet data synced per project" },
                { item: "Admin (admins only)", desc: "Invite users, manage cost categories, configure AppFolio connections" },
              ].map((row) => (
                <tr key={row.item} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.item}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Screenshot
          src="/guide/screenshot-sidebar.png"
          alt="Left sidebar navigation"
          caption="Click the Reports arrow to expand all report links. Admin is only visible to admins."
        />

        <Hint>
          The Reports submenu expands and collapses by clicking &ldquo;Reports&rdquo;. It stays
          open automatically when you&apos;re on any report page.
        </Hint>
      </div>
    ),
  },
  {
    title: "Projects & Gates",
    icon: <FolderKanban className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          Every project is divided into <strong>Gates</strong> — approval milestones or
          phases (e.g., Pre-Development, Construction, Close-Out). Each gate has its own
          budget, broken down by cost category.
        </p>

        <div className="space-y-3">
          <h4 className="font-semibold text-slate-800">Project Page</h4>
          <Screenshot
            src="/guide/screenshot-project.png"
            alt="Project page with Gates and Contracts sections"
            caption="A project page shows all its gates and contracts at a glance."
          />

          <div className="rounded-lg border divide-y text-sm">
            {[
              { step: "1", action: "Click a project from the Dashboard or Projects list." },
              { step: "2", action: "See gates in the Gates panel and contracts in the Contracts panel below." },
              { step: "3", action: "Click any gate row to open it and view or edit its budget amounts by cost category." },
              { step: "4", action: "Use + Add Gate to create a new gate. Give it a name, status, and optional dates." },
              { step: "5", action: "You can also upload gates in bulk using the Upload Excel button." },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 px-4 py-2.5">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{s.step}</span>
                <span className="text-slate-700">{s.action}</span>
              </div>
            ))}
          </div>
        </div>

        <Hint>
          Gate status drives reporting: <strong>Pending</strong> gates are planned,
          <strong> Active</strong> means work is underway, and <strong>Closed</strong> means
          that phase is complete. All gates contribute to the PCM report regardless of status.
        </Hint>

        <h4 className="font-semibold text-slate-800 pt-2">Setting Gate Budgets</h4>
        <Screenshot
          src="/guide/screenshot-gate-budget.png"
          alt="Gate budget editor"
          caption="Open a gate and enter original budget amounts for each cost category, then click Save Budgets."
        />
        <p className="text-sm text-slate-600">
          Inside a gate, every active cost category is listed. Enter the <strong>Original Budget</strong> for
          each category and click <strong>Save Budgets</strong>. Approved change orders on the gate appear
          as <em>Authorized Adjustments</em> in the PCM report (Column B).
        </p>
      </div>
    ),
  },
  {
    title: "Contracts & Schedule of Values",
    icon: <FolderKanban className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          Contracts track your committed spend. Every contract must have at least one
          <strong> Schedule of Values (SOV)</strong> line that assigns the contract&apos;s
          value to a cost category. This is how committed dollars flow into the correct
          row of the PCM report.
        </p>

        <Screenshot
          src="/guide/screenshot-contract.png"
          alt="Contract entry form with SOV lines"
          caption="The contract form: fill in vendor details, then add SOV lines below."
        />

        <div className="rounded-lg border divide-y text-sm">
          {[
            { label: "Vendor Name", desc: "The subcontractor or supplier — required." },
            { label: "Contract #", desc: "Your internal contract reference number (optional)." },
            { label: "Description", desc: "Brief description of the scope of work." },
            { label: "Original Value", desc: "The total base contract amount (calculated automatically from SOV lines)." },
            { label: "Gate(s)", desc: "Which gate phase(s) this contract belongs to." },
            { label: "Execution Date", desc: "When the contract was signed. Contracts without a date or with a future date are still included in commitments." },
            { label: "SOV Lines", desc: "At least one required. Each line assigns an amount to a cost category. The sum of all lines = the original contract value." },
            { label: "Status", desc: "Active (default), Complete, or Terminated. Terminated contracts are excluded from committed totals." },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-2">
              <span className="font-semibold text-slate-800 whitespace-nowrap w-36 shrink-0">{row.label}</span>
              <span className="text-slate-600">{row.desc}</span>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-slate-800 pt-2">Change Orders</h4>
        <p className="text-sm text-slate-600">
          Once a contract is saved, open it and use the <strong>Add Change Order</strong> button.
          Change orders can be <em>Proposed</em> (shows in Column D of PCM) or <em>Approved</em>
          (adds to Column B — Authorized Adjustments — and increases the committed total).
        </p>

        <Hint>
          If a contract spans multiple cost categories (e.g., both concrete and framing),
          add one SOV line per cost category. Each line flows to its own row in the PCM report.
        </Hint>
      </div>
    ),
  },
  {
    title: "Project Cost Management Report",
    icon: <BarChart3 className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The <strong>PCM Report</strong> is the central financial report. Select one or more
          projects and an as-of date — the report shows every cost category with its full
          budget-to-actual breakdown.
        </p>

        <Screenshot
          src="/guide/screenshot-pcm.png"
          alt="Project Cost Management report"
          caption="PCM report: 13 columns covering budget, commitments, and incurred costs per cost category."
        />

        <div className="rounded-lg border overflow-hidden text-xs">
          <div className="bg-slate-800 text-white px-4 py-2 font-semibold">Column Reference</div>
          <div className="divide-y">
            {[
              { col: "A", label: "Original Budget", desc: "Sum of all gate original budget amounts for this cost category." },
              { col: "B", label: "Authorized Adj.", desc: "Approved change orders on gate budgets." },
              { col: "C = A+B", label: "Current Budget", desc: "What you&apos;re currently authorized to spend." },
              { col: "D", label: "Proposed Adj.", desc: "Proposed (not yet approved) change orders." },
              { col: "E = C+D", label: "Projected Budget", desc: "Current budget including pending changes." },
              { col: "F = A-E", label: "Variance", desc: "Red = over original budget. Green = under." },
              { col: "G", label: "Total Committed", desc: "Sum of all active contract SOV lines for this category. Click to drill into Commitment Detail." },
              { col: "H = G÷C", label: "% Committed", desc: "How much of your current budget is already committed." },
              { col: "I = C-G", label: "Uncommitted", desc: "Budget still available to commit." },
              { col: "J", label: "Costs Paid", desc: "AppFolio paid invoices through the as-of date. Click to see transactions." },
              { col: "K", label: "Costs Unpaid", desc: "AppFolio invoices posted but not yet paid." },
              { col: "L = J+K", label: "Total Incurred", desc: "All costs recorded in AppFolio to date." },
              { col: "M = C-L", label: "Balance to Complete", desc: "Remaining budget after actual costs." },
            ].map((row) => (
              <div key={row.col} className="flex gap-2 px-4 py-2 hover:bg-slate-50">
                <span className="font-mono font-bold text-slate-800 w-16 shrink-0">{row.col}</span>
                <span className="font-medium text-slate-700 w-32 shrink-0">{row.label}</span>
                <span className="text-slate-600" dangerouslySetInnerHTML={{ __html: row.desc }} />
              </div>
            ))}
          </div>
        </div>

        <Hint>
          Column G (Total Committed) is <strong>clickable</strong> — it opens the Commitment
          Detail report pre-filtered to that project and cost category so you can see exactly
          which contracts make up the number.
        </Hint>
      </div>
    ),
  },
  {
    title: "Drilldown Reports",
    icon: <BarChart3 className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          Three detail reports let you investigate the numbers behind the PCM report.
          All support Excel export and Print / PDF.
        </p>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="font-semibold text-slate-800 mb-1">Commitment Detail</h4>
            <p className="text-sm text-slate-600 mb-3">
              Shows every contract that contributes to column G (Total Committed). Filter by
              project, cost category, and contract status. Each row shows the vendor, contract
              number, gate(s), SOV base amount, approved COs, and total committed.
            </p>
            <Screenshot
              src="/guide/screenshot-commitment-detail.png"
              alt="Commitment Detail report"
              caption="Commitment Detail — one row per contract × cost category."
            />
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="font-semibold text-slate-800 mb-1">Cost Detail</h4>
            <p className="text-sm text-slate-600 mb-3">
              AppFolio transactions filtered by project, cost category, and paid/unpaid status.
              Click column J or K values in the PCM report to open this pre-filtered. Includes
              a direct link to each bill in AppFolio when configured.
            </p>
            <Screenshot
              src="/guide/screenshot-cost-detail.png"
              alt="Cost Detail report"
              caption="Cost Detail — every AppFolio transaction line matching your filters."
            />
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="font-semibold text-slate-800 mb-1">Vendor Detail</h4>
            <p className="text-sm text-slate-600">
              All transactions for a specific vendor (or all vendors) across any project.
              Useful for auditing a particular subcontractor&apos;s invoices over time.
            </p>
          </div>
        </div>

        <Hint>
          Every report remembers your last filter. When you return to a report, it
          automatically restores where you left off.
        </Hint>
      </div>
    ),
  },
  {
    title: "Quick Tips",
    icon: <BookOpen className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: "📅",
              title: "As-of Date",
              desc: "Every report has an as-of date filter. Change it to see the state of the project at any point in time — budgets, commitments, and costs are all date-filtered.",
            },
            {
              icon: "🔄",
              title: "AppFolio Sync",
              desc: "Clicking Run Report on the PCM, Cost Detail, or Vendor Detail reports automatically syncs AppFolio data for the selected project before loading. You can also trigger a manual sync from Admin › AppFolio.",
            },
            {
              icon: "📤",
              title: "Export to Excel",
              desc: "Every report has an Excel export button in the top right. Column widths and number formatting are pre-set for a clean export.",
            },
            {
              icon: "🖨️",
              title: "Print / PDF",
              desc: "Use the Print / PDF button to send any report to your printer or save as PDF. Reports automatically switch to landscape and reduce font sizes for print.",
            },
            {
              icon: "⚠️",
              title: "Unmatched Costs",
              desc: "If AppFolio transactions can't be matched to a cost category, they appear in an 'Unmatched Costs' section in the PCM report. Fix by ensuring cost category codes in AppFolio match those in Admin › Cost Categories.",
            },
            {
              icon: "🔒",
              title: "Locked Gates",
              desc: "Gates can be locked to prevent budget edits. A locked gate icon will appear on the gate. Only admins can lock/unlock gates.",
            },
            {
              icon: "👥",
              title: "User Roles",
              desc: "Read Only users can view everything. Project Managers can create/edit projects, gates, and contracts. Admins also manage users, cost categories, and AppFolio settings.",
            },
            {
              icon: "📋",
              title: "Project Access",
              desc: "Admins can restrict which projects each user can see via Admin › Users & Access › Project Access section. By default, users see all projects.",
            },
          ].map((tip) => (
            <div key={tip.title} className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">{tip.icon}</span>
                <div>
                  <div className="font-semibold text-sm text-slate-800 mb-1">{tip.title}</div>
                  <div className="text-xs text-slate-600 leading-relaxed">{tip.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <strong>You&apos;re all set!</strong> This guide is always available from the{" "}
          <strong>Quick Start Guide</strong> link at the bottom of the left sidebar.
          Reach out to your system administrator with any questions.
        </div>
      </div>
    ),
  },
];

/* ─── Modal ───────────────────────────────────────────── */

interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickStartModal({ isOpen, onClose }: QuickStartModalProps) {
  const [step, setStep] = useState(0);

  // Reset to first step whenever the modal re-opens
  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    try {
      localStorage.setItem("qs_seen_v1", "1");
    } catch { /* ignore */ }
    onClose();
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const current = sections[step];
  const isFirst = step === 0;
  const isLast = step === sections.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-base">Quick Start Guide</span>
            <span className="text-xs text-muted-foreground ml-1">
              {step + 1} / {sections.length}
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close guide"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step title */}
        <div className="px-6 pt-5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-primary">{current.icon}</span>
            <h2 className="text-lg font-bold text-slate-900">{current.title}</h2>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {current.content}
        </div>

        {/* Footer: progress dots + nav */}
        <div className="border-t px-6 py-4 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-xl">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`rounded-full transition-all ${
                  i === step
                    ? "w-5 h-2 bg-primary"
                    : "w-2 h-2 bg-slate-300 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            {isLast ? (
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

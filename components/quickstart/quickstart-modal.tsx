"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, LayoutDashboard, FolderKanban, BarChart3, BookOpen, ShieldCheck, Users } from "lucide-react";

function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="my-4">
      {failed ? (
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 h-36 text-slate-400 text-sm">
          {alt}
        </div>
      ) : (
        <img src={src} alt={alt} onError={() => setFailed(true)} className="w-full rounded-lg border border-slate-200 shadow-sm" />
      )}
      {caption && <figcaption className="mt-1.5 text-center text-xs text-muted-foreground italic">{caption}</figcaption>}
    </figure>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-primary/8 border border-primary/20 px-4 py-3 text-sm text-foreground">
      <span className="shrink-0 font-bold text-primary">💡</span>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-lg border divide-y text-sm">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
          <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold shrink-0">
            {i + 1}
          </span>
          <span className="text-slate-700">{s}</span>
        </div>
      ))}
    </div>
  );
}

const sections = [
  /* 0 ── Welcome ──────────────────────────────────────────────────────── */
  {
    title: "Welcome to KILN",
    icon: <BookOpen className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-base text-slate-700 leading-relaxed">
          KILN is the financial control system for real estate development. One real-time view
          of every project&apos;s budget, commitments, and costs — from approved gate budgets
          through to AppFolio-synced actuals, all in one place.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "📁", title: "Projects & Gates", desc: "Organize projects into approval phases (gates), each with its own cost-category budget." },
            { icon: "📄", title: "Contracts & SOV", desc: "Enter contracts with a Schedule of Values so committed dollars map to the right cost code." },
            { icon: "📊", title: "Reports", desc: "Run the PCM report to see budget vs. committed vs. incurred — drillable to individual transactions." },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border bg-slate-50 p-4">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="font-semibold text-sm text-slate-800 mb-1">{c.title}</div>
              <div className="text-xs text-slate-600 leading-relaxed">{c.desc}</div>
            </div>
          ))}
        </div>
        <Screenshot src="/guide/screenshot-dashboard.png" alt="Dashboard overview" caption="The Dashboard shows a portfolio summary and recent activity." />
        <Hint>This guide is always available — look for the <strong>Quick Start Guide</strong> link at the bottom of the left sidebar. Each page also has a <strong>? help icon</strong> (top right of the header) for page-specific guidance.</Hint>
      </div>
    ),
  },

  /* 1 ── Navigation ───────────────────────────────────────────────────── */
  {
    title: "Navigating the App",
    icon: <LayoutDashboard className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">The dark left sidebar is your main navigation and stays visible on every page. On mobile, tap the <strong>☰ menu icon</strong> in the top-left to open the navigation drawer.</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "hsl(var(--sidebar-bg))" }}>
                <th className="px-4 py-2.5 text-left font-medium text-slate-300">Menu Item</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-300">What it&apos;s for</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { item: "Dashboard", desc: "Portfolio stats, project cards, recent bills, pending COs, and COI/budget alerts" },
                { item: "Projects", desc: "All projects you have access to — filter by status, click any row to open" },
                { item: "Vendors", desc: "Global vendor directory — browse all vendors, view compliance documents and transaction history" },
                { item: "Reporting (click to expand)", desc: "Expand to access all financial reports" },
                { item: "  › Project Cost Management", desc: "The main report: budget vs. committed vs. incurred by cost category" },
                { item: "  › Cost Detail", desc: "Line-by-line AppFolio transactions" },
                { item: "  › Vendor Detail", desc: "Transactions grouped by vendor" },
                { item: "  › Commitment Detail", desc: "Every contract that makes up committed totals" },
                { item: "  › Change Order Log", desc: "All COs across projects — filter by status, type, category, or date" },
                { item: "  › Balance Sheet", desc: "AppFolio balance sheet data per project" },
                { item: "  › Trial Balance", desc: "All GL accounts with debit, credit, and balance totals — includes a balanced check" },
                { item: "  › Gate Detail", desc: "Transactions filtered by gate (budget phase) — see every dollar assigned to a specific phase" },
                { item: "  › Reporting Package", desc: "Opens PCM Report and Balance Sheet side-by-side in two tabs for a selected project" },
                { item: "Admin › (click to expand)", desc: "Users, cost categories, AppFolio settings, audit log — admins only" },
                { item: "Quick Start Guide", desc: "Re-opens this guide at any time (bottom of sidebar)" },
              ].map((row) => (
                <tr key={row.item} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap text-xs">{row.item}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint>
          The <strong>? icon</strong> in the top-right of every page opens a quick-reference
          panel explaining exactly what that page does and how to use it.
        </Hint>
      </div>
    ),
  },

  /* 2 ── Projects & Gates ─────────────────────────────────────────────── */
  {
    title: "Projects & Gates",
    icon: <FolderKanban className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          Projects are divided into <strong>Gates</strong> — approval phases (e.g. Pre-Development,
          Construction, Close-Out). Each gate has its own budget broken down by cost category.
        </p>

        <h4 className="font-semibold text-slate-800">Projects List</h4>
        <p className="text-sm text-slate-600">
          The Projects page shows all projects you have access to. Use the status tabs
          (<em>All / Active / On Hold / Completed / Archived</em>) to filter. Click any row to open the project.
        </p>

        <h4 className="font-semibold text-slate-800 pt-1">Project Detail — Seven Tabs</h4>
        <Screenshot src="/guide/screenshot-project.png" alt="Project page" caption="A project page shows seven tabs: Overview, Gates, Contracts, Vendors, Documents, Draws, and Map." />
        <div className="rounded-lg border divide-y text-sm">
          {[
            { label: "Overview", desc: "Project metadata — name, code, type, status, address, and AppFolio property. Admins and PMs can edit inline." },
            { label: "Gates", desc: "Budget phases with status, dates, and total budget. Click any gate to view or edit its cost-category budgets. Use '+ Add Gate' or 'Upload Excel' to bulk-import." },
            { label: "Contracts", desc: "All contracts with original value, approved COs, revised value, and status. Click any row to open the contract detail." },
            { label: "Vendors", desc: "Vendors linked to this project. Search and filter Active/Inactive/All. Click any vendor name to open their profile. Use 'Manage Vendors' to add or deactivate vendors." },
            { label: "Documents", desc: "Project-level file attachments. Click 'Manage Documents' to upload, download, or remove files." },
            { label: "Draws", desc: "All draw requests for this project. Click '+ New Draw' to create a draw request, then open it to enter amounts by cost category and export to Excel. Draws track budget, previously drawn, and balance remaining." },
            { label: "Map", desc: "Google Maps embed for the project address. Use 'Open in Google Maps' to navigate or get directions." },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-2.5">
              <span className="font-semibold text-slate-800 whitespace-nowrap w-24 shrink-0 text-xs">{row.label}</span>
              <span className="text-slate-600 text-xs">{row.desc}</span>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-slate-800 pt-2">Setting Gate Budgets</h4>
        <StepList steps={[
          "Click a project from the Dashboard or Projects list.",
          "Go to the Gates tab and click any gate row to open it.",
          "Enter Original Budget amounts for each cost category, then click Save Budgets.",
          "Use '+ Add Gate' to create a new phase, or 'Upload Excel' to bulk-import budgets.",
        ]} />

        <Hint>
          Gate statuses: <strong>Pending</strong> = planned, <strong>Active</strong> = in progress,
          <strong> Closed</strong> = complete. All gates contribute to the PCM report regardless of status.
        </Hint>
      </div>
    ),
  },

  /* 3 ── Contracts & SOV ──────────────────────────────────────────────── */
  {
    title: "Contracts & Schedule of Values",
    icon: <FolderKanban className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          Contracts track committed spend. The <strong>Schedule of Values (SOV)</strong> allocates
          a contract&apos;s value across cost categories — this is how committed dollars flow into the
          correct rows of the PCM report.
        </p>
        <Screenshot src="/guide/screenshot-contract.png" alt="Contract detail" caption="Contract detail with SOV lines and change orders." />
        <div className="rounded-lg border divide-y text-sm">
          {[
            { label: "Vendor & Value", desc: "Enter the vendor name and original contract amount." },
            { label: "Gate(s)", desc: "Assign the contract to one or more project phases." },
            { label: "Cost Category", desc: "The primary category — used when there are no SOV lines. When SOV lines exist, the PCM report uses those instead." },
            { label: "SOV Lines", desc: "Add one line per cost code. Each line allocates a portion of the contract value to a specific cost category. The sum of all SOV lines = the contract total." },
            { label: "Change Orders", desc: "Add COs to modify the contract value. Proposed COs appear in PCM column D. Approved COs increase committed totals (column G)." },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-2.5">
              <span className="font-semibold text-slate-800 whitespace-nowrap w-32 shrink-0 text-xs">{row.label}</span>
              <span className="text-slate-600 text-xs">{row.desc}</span>
            </div>
          ))}
        </div>
        <Hint>
          When a contract covers multiple cost codes (e.g. concrete + framing), add one SOV line
          per code. The contract detail will show <em>&ldquo;N categories via Schedule of Values&rdquo;</em>
          confirming the split is active.
        </Hint>
      </div>
    ),
  },

  /* 4 ── PCM Report ───────────────────────────────────────────────────── */
  {
    title: "Project Cost Management Report",
    icon: <BarChart3 className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The <strong>PCM Report</strong> is the central financial tool. Select one or more projects,
          set an as-of date, and click <strong>Run Report</strong>. Each row is a cost category.
        </p>
        <Screenshot src="/guide/screenshot-pcm.png" alt="PCM report" caption="13 columns covering budget, commitments, and incurred costs per cost category." />
        <div className="rounded-lg border overflow-hidden text-xs">
          <div className="px-4 py-2 font-semibold text-slate-300 text-xs" style={{ background: "hsl(var(--sidebar-bg))" }}>
            Column Reference
          </div>
          <div className="divide-y">
            {[
              { col: "A", label: "Original Budget", desc: "Gate original budget amounts for this cost category." },
              { col: "B", label: "Authorized Adj.", desc: "Approved gate change orders." },
              { col: "C = A+B", label: "Current Budget", desc: "Your authorized spending limit." },
              { col: "D", label: "Proposed Adj.", desc: "Proposed (not yet approved) gate change orders." },
              { col: "E = C+D", label: "Projected Budget", desc: "Current budget including pending changes." },
              { col: "F = A−E", label: "Variance", desc: "Red = over original budget. Green = under." },
              { col: "G", label: "Total Committed", desc: "Sum of all active contract SOV lines. Click to open Commitment Detail." },
              { col: "H = G÷C", label: "% Committed", desc: "Portion of current budget already committed." },
              { col: "I = C−G", label: "Uncommitted", desc: "Budget still available to commit." },
              { col: "J", label: "Costs Paid", desc: "AppFolio paid invoices. Click to see transactions." },
              { col: "K", label: "Costs Unpaid", desc: "AppFolio posted but unpaid invoices." },
              { col: "L = J+K", label: "Total Incurred", desc: "All AppFolio costs to date." },
              { col: "M = C−L", label: "Balance to Complete", desc: "Remaining budget after actual costs." },
            ].map((row) => (
              <div key={row.col} className="flex gap-2 px-4 py-2 hover:bg-slate-50">
                <span className="font-mono font-bold text-slate-800 w-14 shrink-0">{row.col}</span>
                <span className="font-medium text-slate-700 w-28 shrink-0">{row.label}</span>
                <span className="text-slate-600">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <Hint>Column G cells are clickable and open Commitment Detail pre-filtered to that project + category. Columns J and K open Cost Detail.</Hint>
      </div>
    ),
  },

  /* 5 ── Drilldown Reports ────────────────────────────────────────────── */
  {
    title: "Reports Index & Drilldown Reports",
    icon: <BarChart3 className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The <strong>Reports</strong> nav item links to the Reports index — a card view of all
          available reports. Click any card to open that report. All reports support
          Excel export and Print/PDF.
        </p>
        <div className="space-y-3">
          {[
            { title: "Cost Detail", body: "Line-by-line AppFolio transactions. Filter by project, cost category, and paid/unpaid status. Includes a direct link to the bill in AppFolio." },
            { title: "Vendor Detail", body: "All transactions grouped by vendor. Useful for auditing a specific subcontractor's invoices over time." },
            { title: "Commitment Detail", body: "Every contract and its SOV allocation — one row per contract × cost category. Shows exactly what makes up PCM column G." },
            { title: "Change Order Log", body: "Every CO across all projects — both contract COs and budget-level COs. Filter by status, type, cost category, or date range. Includes rejection reasons and Excel export." },
            { title: "Balance Sheet", body: "AppFolio balance sheet data (assets, liabilities, equity) synced per project. Choose Accrual or Cash basis." },
            { title: "Trial Balance", body: "All GL accounts for a project and date range. Shows debit (invoiced), credit (paid), and balance (unpaid) totals. Includes all known GL accounts — even those with no activity in the period — plus a balanced check in the totals row." },
            { title: "Gate Detail", body: "Every transaction assigned to a specific gate (budget phase). Filter by project, gate, cost category, and payment status. Gate assignments are set automatically during sync based on bill date, and can be manually overridden." },
            { title: "Reporting Package", body: "Opens the PCM Report and Balance Sheet side-by-side in two new tabs for a selected project — useful for client deliverables." },
          ].map((r) => (
            <div key={r.title} className="rounded-lg border p-4">
              <h4 className="font-semibold text-slate-800 mb-1 text-sm">{r.title}</h4>
              <p className="text-xs text-slate-600">{r.body}</p>
            </div>
          ))}
        </div>
        <Hint>Every report restores your last filter settings automatically when you return to it.</Hint>
      </div>
    ),
  },

  /* 6 ── Vendors & Compliance ─────────────────────────────────────────── */
  {
    title: "Vendors & Compliance",
    icon: <Users className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The <strong>Vendors</strong> section (accessible from the sidebar) is your global
          directory of all subcontractors and suppliers across every project. Each vendor has
          a profile page showing compliance documents, transaction history, and project assignments.
        </p>

        <h4 className="font-semibold text-slate-800">Vendor Profiles</h4>
        <div className="rounded-lg border divide-y text-sm">
          {[
            { label: "COI Tracking", desc: "Upload Certificates of Insurance and set expiration dates. The dashboard will alert you when any COI expires within 60 days." },
            { label: "Lien Waivers", desc: "Track lien waiver documents with expiration dates. Expiring lien waivers are surfaced on the dashboard alongside COI alerts." },
            { label: "Other Documents", desc: "Upload any other compliance files (W-9, license, etc.) using the 'Other' document type." },
            { label: "Transaction History", desc: "See the 10 most recent AppFolio transactions for this vendor. Click 'View Transactions →' to open the full Vendor Detail report." },
            { label: "Project Assignments", desc: "Lists all projects where this vendor is active, with invoiced totals per project." },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-2.5">
              <span className="font-semibold text-slate-800 whitespace-nowrap w-36 shrink-0 text-xs">{row.label}</span>
              <span className="text-slate-600 text-xs">{row.desc}</span>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-slate-800 pt-1">Project-Level Vendors Tab</h4>
        <p className="text-sm text-slate-600">
          The <strong>Vendors tab</strong> on each project shows vendors linked specifically to that project.
          Use the search box to filter by name, and the Active/Inactive/All buttons to toggle status.
          Click <strong>Manage Vendors</strong> to add, rename, or deactivate vendors for that project.
          Vendors are also added automatically when AppFolio syncs transaction data or when contracts are entered.
        </p>

        <Hint>
          Vendor profiles appear automatically once a vendor has at least one AppFolio transaction synced.
          The <strong>COI Alerts</strong> card on the dashboard surfaces all expiring certificates so you
          never miss a renewal.
        </Hint>
      </div>
    ),
  },

  /* 7 ── Admin ────────────────────────────────────────────────────────── */
  {
    title: "Admin Panel",
    icon: <ShieldCheck className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <p className="text-slate-700">
          The <strong>Admin</strong> section (visible to Admins only) opens a card-based index.
          Click any card to open that section.
        </p>
        <div className="space-y-2">
          {[
            { title: "Users & Access", desc: "Invite users via email, set roles (Read Only / Project Manager / Admin), and control per-user project access with the Project Access matrix." },
            { title: "Cost Categories", desc: "Define cost codes used in gate budgets, contracts, and all reports. Load 95 default categories or create custom ones. Deactivate (don't delete) categories that are no longer needed." },
            { title: "AppFolio", desc: "Map AppFolio property IDs to projects, run manual syncs, and review sync history. A daily auto-sync runs at 6 AM UTC when CRON_SECRET is configured." },
            { title: "Audit Log", desc: "Filterable record of every change in the system. Timestamps display in your local timezone. Also contains Budget Import History — see who uploaded a gate budget, which gate it targeted, and the row count." },
          ].map((s) => (
            <div key={s.title} className="rounded-lg border p-3">
              <p className="font-semibold text-sm text-slate-800 mb-0.5">{s.title}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <Hint>
          Role changes take effect immediately on the user&apos;s next page load. Admins always
          see all projects regardless of Project Access settings.
        </Hint>
      </div>
    ),
  },

  /* 8 ── Quick Tips ───────────────────────────────────────────────────── */
  {
    title: "Quick Tips",
    icon: <BookOpen className="h-5 w-5" />,
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: "❓", title: "Page Help Icons", desc: "Every page has a ? icon (top right of the header). Click it for a quick-reference panel explaining that page, what actions are available, and what to watch out for." },
            { icon: "📱", title: "Mobile-Friendly", desc: "The app works on phones and tablets. On mobile, tap the ☰ menu icon in the top-left to open the navigation sidebar. Tables scroll horizontally and detail columns are shown on wider screens." },
            { icon: "📅", title: "As-of Date", desc: "All reports have an as-of date filter. Change it to see the project's state at any point in time — budgets, commitments, and costs are all date-filtered." },
            { icon: "🔄", title: "AppFolio Sync", desc: "Running any PCM, Cost Detail, or Vendor Detail report auto-syncs AppFolio for the selected project. Force a full sync anytime from Admin › AppFolio." },
            { icon: "📤", title: "Export to Excel", desc: "Every report has an Excel export button. Column widths and number formatting are pre-set." },
            { icon: "🖨️", title: "Print / PDF", desc: "Print buttons switch to landscape mode. Table headers print in the brand dark color with white text for professional-looking reports." },
            { icon: "🗂️", title: "Status Tabs", desc: "The Projects list has status tabs (All / Active / On Hold / Completed / Archived) with per-status counts so you can quickly find what you need." },
            { icon: "⚠️", title: "Unmatched Costs", desc: "AppFolio transactions that don't match a cost code appear in an 'Unmatched Costs' section. Fix by ensuring AppFolio account codes match cost category codes in Admin › Cost Categories." },
            { icon: "📋", title: "Budget Import History", desc: "Every Excel gate budget upload is logged in Admin › Audit Log. See who uploaded it, which gate it targeted, the filename, and the row count." },
            { icon: "🤖", title: "AI Assistant", desc: "Type a question in the chat bar on the Dashboard to get instant answers about your projects, costs, reports, and how the app works. On any other page, click the chat bubble in the bottom-right corner. Use the trash icon in the chat header to clear the conversation and start fresh." },
            { icon: "🗃️", title: "Column Picker", desc: "Every report has a Columns button to show or hide individual columns. Preferences are saved per report so your layout is restored on your next visit." },
            { icon: "🗺️", title: "Project Map", desc: "Each project has a Map tab showing its Google Maps location. Use 'Open in Google Maps' to get directions or switch to Street View." },
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
        <div className="rounded-lg bg-primary/8 border border-primary/20 px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">You&apos;re all set!</strong> This guide is always accessible from the{" "}
          <strong>Quick Start Guide</strong> link at the bottom of the sidebar, and the{" "}
          <strong>?</strong> icon on any page for page-specific help.
        </div>
      </div>
    ),
  },
];

/* ─── Modal ────────────────────────────────────────────── */

interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickStartModal({ isOpen, onClose }: QuickStartModalProps) {
  const [step, setStep] = useState(0);

  useEffect(() => { if (isOpen) setStep(0); }, [isOpen]);

  const handleClose = useCallback(() => {
    try { localStorage.setItem("qs_seen_v1", "1"); } catch { /* ignore */ }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const current = sections[step];
  const isFirst = step === 0;
  const isLast = step === sections.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-base">Quick Start Guide</span>
            <span className="text-xs text-muted-foreground ml-1">{step + 1} / {sections.length}</span>
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
        <div className="px-4 sm:px-6 pt-5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-primary">{current.icon}</span>
            <h2 className="text-lg font-bold text-slate-900">{current.title}</h2>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">{current.content}</div>

        {/* Footer */}
        <div className="border-t px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-xl">
          <div className="flex items-center gap-1">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`rounded-full transition-all ${i === step ? "w-5 h-2 bg-primary" : "w-2 h-2 bg-slate-300 hover:bg-slate-400"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 sm:px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
              </button>
            )}
            {isLast ? (
              <button onClick={handleClose} className="inline-flex items-center gap-1 rounded-md bg-primary px-4 sm:px-5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
                Done
              </button>
            ) : (
              <button onClick={() => setStep((s) => s + 1)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 sm:px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity">
                <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

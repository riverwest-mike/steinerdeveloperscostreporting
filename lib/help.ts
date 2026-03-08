import type { PageHelpContent } from "@/components/page-help";

export const HELP: Record<string, PageHelpContent> = {
  dashboard: {
    title: "Dashboard",
    description: "Your real-time overview of all projects. See portfolio-level stats at a glance, then drill into any project for detail.",
    actions: [
      { label: "Stats bar", desc: "Active projects, portfolio budget, total deployed costs, and pending change orders — all scoped to projects you have access to." },
      { label: "Project cards", desc: "Each card shows budget consumption. Green = under budget, amber = over 90%, red = over. Click any card to open the project." },
      { label: "Recent Bills", desc: "Last 90 days of AppFolio transactions. Use the dropdown to filter by time range. Click a project name to go to that project." },
      { label: "Pending COs", desc: "Change orders awaiting approval across all your projects. Age-coded dots: grey = recent, amber = 14+ days, red = 30+ days. Includes both contract COs and budget-level COs. Click a row to open the contract or gate where the CO lives." },
      { label: "AI chat bar", desc: "Type any question about your projects, costs, or reports directly into the chat bar below the greeting. Press Enter or click the arrow to send — the response opens in a centered panel. Suggestion chips offer quick starting points." },
    ],
    tip: "The dashboard updates every time the page loads. AppFolio data reflects the most recent sync. On any page other than the dashboard, the AI assistant is available via the chat bubble in the bottom-right corner.",
  },

  projects: {
    title: "Projects",
    description: "All projects you have access to. Filter by status, then click any row to open a project's full detail.",
    actions: [
      { label: "Status tabs", desc: "Filter the list by status: All, Active, On Hold, Completed, or Archived. The count next to each tab shows how many projects match." },
      { label: "New Project", desc: "Create a project by filling in the name, code, type, address, and other details. The code (e.g. 'SD-001') appears throughout reports. If an AppFolio property is mapped at creation, a transaction sync runs automatically so data is available immediately." },
      { label: "Click a project row", desc: "Opens the project detail page with its gates, contracts, and full budget breakdown." },
    ],
    tip: "Admins see all projects. Other roles only see projects they've been assigned to in Admin › Users & Access.",
  },

  projectDetail: {
    title: "Project Detail",
    description: "The full project view: metadata, gates (budget phases), and contracts. Everything for one project lives here.",
    actions: [
      { label: "Gates section", desc: "Each gate is a budget phase (e.g. Pre-Development, Construction). Click a gate row to open and edit its cost-category budget. The bar shows committed vs. budgeted." },
      { label: "Add Gate", desc: "Create a new phase. Give it a name, status (Pending/Active/Closed), and optional start/end dates." },
      { label: "Upload Excel", desc: "Bulk-import a gate budget from a formatted Excel file. The upload log appears in Admin › Users & Access › Budget Import History." },
      { label: "Contracts section", desc: "All contracts for this project. Click any row to open the contract and view its Schedule of Values and change orders." },
      { label: "Add Contract", desc: "Create a new contract: vendor, value, gate assignment, and cost category." },
    ],
    tip: "Run the PCM Report (Reporting › Project Cost Management) to see this project's complete budget-vs.-actual breakdown.",
  },

  contractDetail: {
    title: "Contract Detail",
    description: "A single contract: its value, gates, cost category, change orders, and Schedule of Values (SOV) line items.",
    actions: [
      { label: "Schedule of Values", desc: "Split the contract's value across multiple cost categories. Each SOV line maps an amount to a cost code. The PCM Report uses SOV lines instead of the top-level category when they exist." },
      { label: "Add Change Order", desc: "Use '+ Add CO' to create a change order. Fill in the description, amount, cost category, and proposed date. The CO number auto-generates (CO-001, CO-002…) unless you enter one manually." },
      { label: "CO Workflow", desc: "Proposed COs appear in PCM column D (Proposed Adj.) — they don't affect committed totals yet. Click Approve to move the amount into column B (Authorized Adj.) and column G (Total Committed). Click Reject to capture a rejection reason and remove the CO from the forecast. Approved COs can be Voided to reverse their budget impact." },
      { label: "Edit a CO", desc: "Click Edit on any proposed (not yet approved) change order to update its description, amount, cost category, or date. Approved and rejected COs are locked." },
      { label: "Reject with reason", desc: "When rejecting a CO, an optional reason field lets you record why. The reason appears on the CO row and in the Change Order Log report." },
      { label: "Edit Contract", desc: "Update vendor name, gates, value, retainage %, status, and dates. Terminating a contract removes it from committed totals." },
    ],
    sections: [
      { heading: "CO Status Reference", body: "Proposed → CO is pending review. Appears in PCM column D.\nApproved → CO is confirmed. Increases Authorized Adj. (col B) and Total Committed (col G).\nRejected → CO was declined. No budget impact. Rejection reason is stored.\nVoided → Previously approved CO was reversed. Budget impact removed." },
    ],
    tip: "If a contract covers multiple cost codes (e.g. concrete + framing), add one SOV line per cost code. Each line feeds its own row in the PCM Report.",
  },

  gateDetail: {
    title: "Gate Budget",
    description: "Set and review the budget for this gate (phase) by cost category. Each row is one cost code. Budget change orders let you adjust the gate budget without touching a contract.",
    actions: [
      { label: "Enter budgets", desc: "Type the Original Budget amount for each cost category row and click Save Budgets. You can edit any row at any time unless the gate is locked." },
      { label: "Revised Budget", desc: "Shows the original budget plus the total of all approved budget change orders for each category. This flows into PCM column C (Current Budget)." },
      { label: "Add Budget CO", desc: "Click '+ Add Budget CO' to create a change order that adjusts the gate budget without being tied to a contract. Use this for scope additions or reductions at the budget level. Proposed budget COs appear in PCM column D; approved ones add to column B (Authorized Adj.)." },
      { label: "Budget CO Workflow", desc: "Budget COs follow the same proposed → approved / rejected / voided workflow as contract COs. You can also edit or delete proposed budget COs. All actions are logged in the audit trail." },
      { label: "Lock/Unlock", desc: "Admins can lock a gate to prevent further budget edits. A lock icon appears on locked gates." },
    ],
    tip: "Use budget COs when the project scope changes and you need to adjust the budget before a contract is executed. For changes to an existing contract, add the CO on the contract detail page instead.",
  },

  reports: {
    title: "Reporting",
    description: "Choose a report to analyze project financials. Each report covers a different view — from high-level budgets to individual transactions.",
    actions: [
      { label: "Project Cost Management (PCM)", desc: "The primary report: budget vs. committed vs. incurred per cost category. Select projects and a date, then run." },
      { label: "Cost Detail", desc: "Line-by-line AppFolio transactions. Drill into PCM columns J or K to open this pre-filtered." },
      { label: "Vendor Detail", desc: "All transactions grouped by vendor across any project." },
      { label: "Commitment Detail", desc: "Every contract that makes up PCM column G (Total Committed)." },
      { label: "Change Order Log", desc: "All change orders across projects — filter by status, type, cost category, or date range." },
      { label: "Balance Sheet", desc: "AppFolio balance sheet data synced per project." },
      { label: "Trial Balance", desc: "All AppFolio transactions grouped by GL account for a selected project and date range." },
      { label: "Gate Detail", desc: "Transactions filtered by gate (budget phase). Shows everything assigned to a specific gate with project, vendor, cost category, and amounts." },
      { label: "Reporting Package", desc: "Open the PCM Report and Balance Sheet for a project side-by-side in two new tabs." },
    ],
    tip: "Use the Columns button on any report to show or hide individual columns. Your column preferences are saved per report.",
  },

  pcmReport: {
    title: "Project Cost Management Report",
    description: "The central financial report. Shows every cost category with its complete budget-to-actual breakdown for the selected projects and date.",
    actions: [
      { label: "Select projects", desc: "Use the project dropdown to pick one or multiple projects. 'All Projects' includes everything you have access to." },
      { label: "As-of Date", desc: "Filters AppFolio transactions to only include activity through this date. Useful for month-end reporting." },
      { label: "Run Report", desc: "Syncs AppFolio data for the selected projects, then loads the report. May take a few seconds for large projects." },
      { label: "Click column G", desc: "Any cell in the Total Committed column opens Commitment Detail pre-filtered to that project + cost category." },
      { label: "Click columns J or K", desc: "Opens Cost Detail pre-filtered to that project + cost category + paid/unpaid status." },
    ],
    sections: [
      {
        heading: "Column Reference",
        body: "A=Original Budget · B=Authorized Adj. · C=Current Budget (A+B) · D=Proposed Adj. · E=Projected Budget (C+D) · F=Variance (A−E) · G=Total Committed · H=% Committed · I=Uncommitted (C−G) · J=Costs Paid · K=Costs Unpaid · L=Total Incurred (J+K) · M=Balance to Complete (C−L)",
      },
      {
        heading: "Change Orders in the PCM Report",
        body: "Column B (Authorized Adj.) — Sum of all approved change orders for each cost category. Includes both contract COs and budget-level COs (no contract required). Approved COs increase C (Current Budget).\n\nColumn D (Proposed Adj.) — Sum of all proposed (pending) change orders. These are not yet confirmed and don't affect committed totals, but they show the projected impact if approved.\n\nColumn G (Total Committed) — Includes contract base values plus all approved contract change orders. Budget-level COs (gate-only, no contract) are not included in G — they affect B and D only.",
      },
    ],
    tip: "Use Export to Excel for a formatted spreadsheet, or Print / PDF for a landscape-formatted print-ready version.",
  },

  costDetail: {
    title: "Cost Detail Report",
    description: "Every AppFolio transaction for the selected filters. One row per invoice line, with direct links back to AppFolio when configured.",
    actions: [
      { label: "Filter by project", desc: "Select one project to see its transactions. The project's AppFolio property mapping must be set up in Admin › AppFolio." },
      { label: "Filter by cost category", desc: "Narrow to a specific cost code, or leave blank for all categories." },
      { label: "Paid / Unpaid", desc: "Toggle between paid (J) and unpaid (K) transactions, or show all." },
      { label: "Date range", desc: "Filter transactions to a specific date window." },
      { label: "Gate column", desc: "Shows which gate (budget phase) each transaction has been assigned to. Assignments are set automatically during sync based on the transaction's bill date. A small blue dot indicates the gate was manually assigned. Admins and Project Managers can change the gate by hovering over the row and clicking the pencil icon — a dropdown lists all gates for that project." },
    ],
    tip: "Click a bill description to open the invoice directly in AppFolio (requires your AppFolio URL to be configured in Admin).",
  },

  vendorDetail: {
    title: "Vendor Detail Report",
    description: "All AppFolio transactions grouped by vendor. Use this to audit a specific subcontractor's activity across projects.",
    actions: [
      { label: "Vendor filter", desc: "Type a vendor name to narrow the list. Partial matches work." },
      { label: "Project filter", desc: "Limit to one project, or show the vendor across all projects you have access to." },
      { label: "Date range", desc: "Filter to a specific time window." },
      { label: "Gate column", desc: "Shows which gate (budget phase) each transaction has been assigned to. Assignments are set automatically during sync based on the transaction's bill date. A small blue dot indicates the gate was manually assigned. Admins and Project Managers can change the gate by hovering over the row and clicking the pencil icon." },
    ],
    tip: "Useful for checking whether a vendor's invoices match their contract commitments.",
  },

  gateDetailReport: {
    title: "Gate Detail Report",
    description: "All transactions assigned to a specific gate (budget phase). Use this to review every dollar of actual spend within a gate — broken down by vendor, cost category, and payment status.",
    actions: [
      { label: "Project filter", desc: "Select one or more projects. At least one project must be selected to run the report." },
      { label: "Gate filter", desc: "Auto-populates with all gates once a project is selected. Select a specific gate to narrow the report to that phase, or leave blank to see all gates for the selected project(s). When multiple projects are selected, gate options are prefixed with the project code." },
      { label: "Cost Category filter", desc: "Narrow to a specific cost code, or leave blank for all categories." },
      { label: "Payment filter", desc: "Show all transactions, paid only, or unpaid only." },
      { label: "As of Date", desc: "Filters transactions to activity through this date. Useful for month-end reporting." },
      { label: "Gate column", desc: "Shows the assigned gate for each transaction. Admins and Project Managers can reassign a transaction to a different gate by clicking the pencil icon. A blue dot indicates the gate was manually assigned rather than auto-assigned." },
    ],
    tip: "Gate assignments are set automatically during sync when the transaction's bill date falls within the gate's start and end date window. Set start and end dates on your gates in the Project › Gate Detail page to enable auto-assignment.",
  },

  changeOrderLog: {
    title: "Change Order Log",
    description: "A complete, filterable record of every change order across all projects — both contract COs and budget-level COs. Use this to audit CO activity, track approvals, or review rejection reasons.",
    actions: [
      { label: "Filter by project", desc: "Check one or more projects. Leave all unchecked to see COs across every project you have access to." },
      { label: "Filter by status", desc: "Show only Proposed, Approved, Rejected, or Voided COs — or all statuses at once." },
      { label: "Filter by type", desc: "Contract COs are tied to a specific contract. Budget COs adjust a gate budget with no contract attached." },
      { label: "Filter by cost category", desc: "Narrow to a specific cost code." },
      { label: "Date range", desc: "Filter by proposed date to see COs from a specific time window." },
      { label: "Export to Excel", desc: "Downloads all filtered rows as a formatted spreadsheet. Includes rejection reasons and notes." },
    ],
    sections: [
      { heading: "CO Type Reference", body: "Contract CO — Tied to a specific contract and vendor. Affects PCM columns B, D, and G.\n\nBudget CO — Tied to a gate and cost category only, with no contract. Affects PCM columns B and D only (not G, since there is no commitment)." },
    ],
    tip: "Click a CO number to go directly to the contract detail page, or click the gate name to open the gate budget. Rejection reasons entered during the reject workflow are visible in this report.",
  },

  commitmentDetail: {
    title: "Commitment Detail Report",
    description: "Every contract and its cost-category allocations — exactly what makes up PCM column G (Total Committed). One row per contract × cost category.",
    actions: [
      { label: "Project filter", desc: "Select one or more projects. Defaults to all accessible projects." },
      { label: "Cost category filter", desc: "Narrow to a specific cost code." },
      { label: "Contract status", desc: "Show Active contracts only, Complete, or All (includes terminated)." },
      { label: "As-of Date", desc: "Only includes contracts and change orders with activity through this date." },
    ],
    tip: "Clicking PCM column G opens this report pre-filtered to that project and cost category automatically.",
  },

  balanceSheet: {
    title: "Balance Sheet Report",
    description: "AppFolio balance sheet data synced per project. Shows assets, liabilities, and equity line items as of the selected date.",
    actions: [
      { label: "Select projects", desc: "Pick one or multiple projects. Each must have an AppFolio property mapped in Admin › AppFolio." },
      { label: "Accounting Basis", desc: "Choose Accrual or Cash basis to match your reporting needs." },
      { label: "Run Report", desc: "Syncs AppFolio balance sheet data for the selected projects before displaying." },
    ],
    tip: "Balance sheet data is only as current as the last AppFolio sync. Run from Admin › AppFolio to force an update.",
  },

  trialBalance: {
    title: "Trial Balance",
    description: "All AppFolio transactions for a project and date range, grouped by GL account. Shows invoice, paid, and unpaid totals per account.",
    actions: [
      { label: "Project filter", desc: "Select one project to see its transactions, or leave blank to see all projects you have access to." },
      { label: "Date range", desc: "Set From and To dates to filter transactions by bill date. Leave From blank to include all history through the To date." },
      { label: "Run Report", desc: "Loads transactions matching your filters. Each GL account shows a header row with totals, followed by its individual transactions." },
      { label: "Export Excel", desc: "Downloads all rows as a formatted spreadsheet, grouped by GL account with subtotals." },
    ],
    sections: [
      { heading: "Reading the Report", body: "Each bold row is a GL account header showing the account total (invoice, paid, unpaid). The indented rows below it are the individual transactions that make up that total." },
    ],
    tip: "Use the date range filters to produce a period-specific trial balance — for example, a full-year view or a single month.",
  },

  adminIndex: {
    title: "Admin Panel",
    description: "System administration for the Cost Tracker. Each section manages a different part of the configuration.",
    actions: [
      { label: "Users & Access", desc: "Invite users, set roles (Read Only / Project Manager / Admin), and control which projects each user can see." },
      { label: "Cost Categories", desc: "Manage the cost codes used in gate budgets, contracts, and all reports." },
      { label: "AppFolio", desc: "Map AppFolio properties to projects and manage sync settings." },
      { label: "Audit Log", desc: "Review every change made in the system — who changed what, and when." },
      { label: "Budget Imports", desc: "See the history of Excel gate budget uploads in Admin › Audit Log." },
    ],
    tip: "Only Admin users can see this section. Role changes take effect immediately on the user's next page load.",
  },

  adminUsers: {
    title: "Users & Access",
    description: "Manage all users and their project access. Invite new users, set roles, and control which projects each person can see.",
    actions: [
      { label: "Add User", desc: "Click '+ Add User' to send an invitation email. Set the user's role (Read Only, Project Manager, or Admin) before sending." },
      { label: "Activate / Deactivate", desc: "Toggle a user's active status. Inactive users cannot log in but their data is preserved." },
      { label: "Project Access matrix", desc: "Check boxes in the Project Access section to grant a user access to specific projects. Admins always see all projects." },
      { label: "Budget Import History", desc: "Excel gate budget upload history has moved to Admin › Audit Log. A link at the bottom of this page takes you there." },
    ],
    sections: [
      { heading: "Roles", body: "Read Only: view all data. Project Manager: create/edit projects, gates, contracts, and change orders. Admin: all PM capabilities plus user management, cost categories, and AppFolio settings." },
    ],
    tip: "A user's role applies across all projects they can access. There are no per-project role overrides.",
  },

  costCategories: {
    title: "Cost Categories",
    description: "Cost categories (cost codes) define the rows in gate budgets, contracts, and all reports. Every dollar is tracked under a cost code.",
    actions: [
      { label: "Load defaults", desc: "If no categories exist yet, use 'Load default categories (95)' to seed the standard construction cost code list." },
      { label: "New Category", desc: "Create a custom cost code. The Code field (e.g. '010100') is used for matching with AppFolio. Header Category groups related codes visually in reports." },
      { label: "Edit", desc: "Update the name, code, header category, or display order of any category." },
      { label: "Deactivate", desc: "Hides a category from new gate budgets and contracts, but preserves all historical data that references it. Preferred over deleting." },
      { label: "Delete", desc: "Permanently removes a category — only possible if no gate budgets, contracts, change orders, or SOV lines reference it." },
    ],
    tip: "The cost code must match the account code in AppFolio for transaction matching to work. Check Admin › AppFolio if transactions are appearing as 'Unmatched'.",
  },

  auditLog: {
    title: "Audit Log",
    description: "A complete, filterable record of every change made in the system. Timestamps display in your local timezone.",
    actions: [
      { label: "Filter by user", desc: "Select a specific user to see only their actions." },
      { label: "Filter by project", desc: "Limit to changes affecting one project." },
      { label: "Filter by action", desc: "Show only a specific type of action (e.g. 'Approved change order')." },
      { label: "Date range", desc: "Filter to a specific time window using From and To date pickers." },
      { label: "Pagination", desc: "Results are paginated at 100 per page. Use Previous/Next to navigate." },
    ],
    tip: "The audit log is append-only — entries cannot be deleted. Use it to resolve disputes about what changed and when.",
  },

  appfolio: {
    title: "AppFolio Integration",
    description: "Connect AppFolio property data to this system. Map properties to projects, run manual syncs, and review sync history.",
    actions: [
      { label: "Map a property", desc: "Enter the AppFolio Property ID (found in the AppFolio URL when viewing a property) next to each project. This tells the system where to pull transaction data from." },
      { label: "Sync Now", desc: "Manually trigger an AppFolio data sync for all mapped properties. Running a report also triggers a sync automatically." },
      { label: "Sync history", desc: "The table shows each sync run: whether it was manual or scheduled, how many transactions were imported, and any errors." },
      { label: "Auto-sync", desc: "A daily automatic sync runs at 6 AM UTC (requires CRON_SECRET environment variable to be set in Vercel)." },
      { label: "New project sync", desc: "When a project is created with an AppFolio property already mapped, a single-property sync runs automatically to backfill transaction history — no manual sync needed." },
    ],
    sections: [
      {
        heading: "Troubleshooting",
        body: "Transactions showing as 'Unmatched': verify the AppFolio account code matches the cost category code in Admin › Cost Categories.\n\nNo transactions after creating a project: confirm the AppFolio Property ID was set at creation. If it was added after the fact, run Sync Now or wait for the nightly auto-sync.\n\nSync history shows failures: check that APPFOLIO_CLIENT_ID and APPFOLIO_CLIENT_SECRET are correctly set in your environment variables. A single-property sync (triggered from a report) can be used to test one project without affecting others.",
      },
    ],
    tip: "If transactions are showing as 'Unmatched' in the PCM Report, check that the AppFolio account codes match cost category codes in Admin › Cost Categories.",
  },
};

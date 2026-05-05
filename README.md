# KILN

> **Where projects take shape.**
>
> _by RiverWest_

KILN is the financial control system for real estate development. Control commitments. Forecast exposure. Approve with confidence. Every decision recorded. Every dollar accounted for.

## Overview

KILN gives developers a single, real-time view of every construction project's financial position — from approved gate budgets and vendor contracts through to AppFolio-synced invoice actuals. Key capabilities:

- **Gate budgets** — Organize each project into approval phases (gates) with cost-category budgets
- **Contracts & SOV** — Track committed spend with Schedule of Values allocations per cost code
- **Change orders** — Full workflow (proposed → approved / rejected / voided) for both contract and budget-level COs
- **AppFolio sync** — Automatic and manual sync of vendor ledger transactions and balance sheet data
- **Reports** — PCM, Cost Detail, Vendor Detail, Commitment Detail, Change Order Log, Balance Sheet, Trial Balance, Gate Detail, and Reporting Package
- **Draw requests** — Create lender draw requests by cost category, track cumulative draws and balance remaining, and export to Excel
- **Gate assignments** — Transactions are automatically assigned to gates based on bill date; manual overrides by admins and PMs
- **AI assistant** — Ask questions about projects, costs, and reports in natural language

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router, React Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | [Supabase](https://supabase.com) (PostgreSQL + Row Level Security) |
| Auth | [Clerk](https://clerk.com) |
| Deployment | [Vercel](https://vercel.com) |
| AI | Anthropic Claude API |

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project
- A Clerk application
- AppFolio API credentials (Client ID + Client Secret)

### Environment Variables

Create a `.env.local` file at the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# AppFolio
APPFOLIO_CLIENT_ID=<client-id>
APPFOLIO_CLIENT_SECRET=<client-secret>
APPFOLIO_BASE_URL=https://your-company.appfolio.com

# Cron (Vercel Cron job protection)
CRON_SECRET=<random-secret>

# Anthropic (AI assistant)
ANTHROPIC_API_KEY=sk-ant-...
```

### Database Setup

Run the full schema against your Supabase project:

1. Open the Supabase SQL Editor
2. Paste and run `supabase/schema.sql`
3. Apply any pending migrations in `supabase/migrations/` in date order

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  (dashboard)/          # Authenticated routes
    admin/              # Admin panel (users, cost categories, AppFolio, audit log)
    projects/           # Project list and detail pages
    reports/            # All financial reports
      cost-management/  # PCM report
      cost-detail/      # Line-by-line transactions
      vendor-detail/    # Transactions by vendor
      commitment-detail/# Contract commitments
      change-order-log/ # CO audit log
      balance-sheet/    # AppFolio balance sheet
      trial-balance/    # GL account trial balance
      gate-detail/      # Transactions by gate
  api/
    appfolio/           # Sync endpoints (vendor ledger + balance sheet)
    admin/              # Admin API routes (gate assignment, etc.)
    cron/               # Daily auto-sync (Vercel Cron)
components/             # Shared UI components
lib/
  appfolio-sync-core.ts # Core sync and gate auto-assignment logic
  help.ts               # Page-level help content
supabase/
  schema.sql            # Full database schema
  migrations/           # Incremental migration files
```

## Reports

| Report | Description |
|--------|-------------|
| **Project Cost Management (PCM)** | 13-column budget-vs.-actual by cost category. Columns A–M cover budget, authorized adjustments, commitments, and incurred costs. |
| **Cost Detail** | Every AppFolio transaction, filterable by project, cost category, paid/unpaid status, and date range. Gate column shows phase assignment. |
| **Vendor Detail** | Transactions grouped by vendor across one or more projects. |
| **Commitment Detail** | All contracts and SOV allocations — the source of PCM column G. |
| **Change Order Log** | All COs (contract and budget-level) with filtering by status, type, category, and date. |
| **Balance Sheet** | AppFolio balance sheet data (assets, liabilities, equity) synced per project, Accrual or Cash basis. |
| **Trial Balance** | All GL accounts with debit (invoiced), credit (paid), and balance (unpaid) totals. Includes accounts with no activity in the period. Balanced check in the totals footer. |
| **Gate Detail** | Transactions assigned to a specific gate, with cost category and payment status filters. |
| **Reporting Package** | Opens PCM Report and Balance Sheet in two tabs for a selected project — for client deliverables. |

## Workflows

### Contracts & Commitments

Contracts represent committed spend against a project. Each contract flows into PCM column G (Total Committed).

**Creating a contract:**

1. Open a project and go to the **Contracts** tab.
2. Click **+ Add Contract** and fill in vendor name, original value, gate(s), and primary cost category.
3. Save the contract.

**Schedule of Values (SOV):**

If a contract covers multiple cost codes (e.g. concrete + framing), add SOV lines instead of relying on the primary category:

1. Open the contract detail page.
2. Under **Schedule of Values**, add one line per cost category with the allocated dollar amount.
3. The sum of all SOV lines must equal the contract's total value.
4. When SOV lines exist, the PCM report uses them — each line appears as its own row under the correct cost category.

**Change order workflow:**

| Status | Meaning | PCM impact |
|--------|---------|------------|
| **Proposed** | Pending review | Column D (Proposed Adj.) only — no effect on committed totals |
| **Approved** | Confirmed | Increases column B (Authorized Adj.) and column G (Total Committed) |
| **Rejected** | Declined | No budget impact; rejection reason is stored |
| **Voided** | Previously approved CO reversed | Removes the budget impact from B and G |

Steps:
1. On the contract detail page, click **+ Add CO**.
2. Enter description, amount, cost category, and proposed date. The CO number auto-generates (CO-001, CO-002…).
3. Use **Approve**, **Reject**, or **Void** buttons to advance the status. Rejected COs can record a reason.
4. Proposed COs can be edited; approved and rejected COs are locked.

**Budget-level COs** (no contract required) work the same way but are created from the **Gate Budget** page. They affect columns B and D in the PCM report but not column G, since there is no contract commitment.

---

### Draw Requests

Draw requests are lender disbursement requests created per project. Each draw specifies the amount requested for each cost category in a given funding round.

**Creating a draw:**

1. Open a project and go to the **Draws** tab.
2. Click **+ New Draw**. A draft draw is created automatically with the next sequential draw number.
3. Click the draw row to open it.

**Entering amounts:**

1. Click **Edit Amounts** to enter or update the dollar amount requested for each cost category.
2. Only categories with an existing budget or prior draw history are shown in read mode. All active categories appear in edit mode.
3. Save when done.

**Draw status workflow:**

```
Draft → Submitted → Approved
                 → Rejected
Approved / Rejected → (Revert to Draft)
```

- Use the status buttons in the draw header to advance or revert the draw.
- Only **Draft** draws can have their amounts or header details (date, lender, title, notes) edited.
- Approved and rejected draws can be reverted to Draft if corrections are needed.

**Key columns:**

| Column | Description |
|--------|-------------|
| **Total Budget** | Revised gate budget for the cost category |
| **Previously Drawn** | Sum of all other draw requests for the project (any status) — cumulative history |
| **This Draw** | Amount entered for this specific draw request |
| **Balance Remaining** | Total Budget − Previously Drawn − This Draw. Negative means the draw exceeds the approved budget. |

**Exporting:**

Click **Export to Excel** to download a `.xlsx` file with the full draw schedule: cost category, total budget, previously drawn, this draw amount, and balance remaining.

> **Note:** Actual invoices and supporting documents are stored in AppFolio. A complete draw package (with attachments) must be assembled in AppFolio — this app generates the draw schedule only.

---

## AppFolio Sync

Transactions are pulled from the AppFolio vendor ledger API:

- **Manual sync** — from Admin › AppFolio or automatically when running a PCM / Cost Detail / Vendor Detail report
- **Auto-sync** — daily Vercel Cron job at 6 AM UTC (requires `CRON_SECRET`)
- **Gate auto-assignment** — after every sync, transactions are matched to gates based on `bill_date` falling within a gate's `start_date`/`end_date` window

## User Roles

| Permission | Admin | Accounting | Project Manager | Read Only |
|---|:---:|:---:|:---:|:---:|
| **Project scope** | All projects | All projects | Assigned only | Assigned only |
| View projects, gates, contracts, COs | ✅ | ✅ | ✅ | ✅ |
| View reports (all types) | ✅ | ✅ | ✅ | ✅ |
| View audit log | ✅ | ✅ | ❌ | ❌ |
| Create / edit projects | ✅ | ✅ | ✅ | ❌ |
| Create / edit gates & budgets | ✅ | ✅ | ✅ | ❌ |
| Create / edit contracts & change orders | ✅ | ✅ | ✅ | ❌ |
| Reassign transaction gates | ✅ | ✅ | ✅ | ❌ |
| Upload vendor documents | ✅ | ✅ | ✅ | ❌ |
| Link AppFolio property IDs | ✅ | ✅ | ❌ | ❌ |
| AppFolio sync & settings | ✅ | ✅ | ❌ | ❌ |
| Manage cost categories | ✅ | ✅ | ❌ | ❌ |
| **Delete projects** | ✅ | ❌ | ❌ | ❌ |
| **Delete / reopen gates** | ✅ | ❌ | ❌ | ❌ |
| **Users & Access** (invite, roles, activate) | ✅ | ❌ | ❌ | ❌ |

Admins and Accounting users see all projects. Project Managers and Read Only users see only projects they have been assigned to in Admin › Users & Access.

## Deployment

The app is deployed on Vercel. Environment variables are set in the Vercel project settings. The daily cron job is configured in `vercel.json`.

To deploy a new version, push to the configured production branch. Vercel builds automatically on push.

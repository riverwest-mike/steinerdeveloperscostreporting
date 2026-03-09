# Steiner Developers Cost Tracker

A construction cost management platform for tracking project budgets, contracts, and actual costs against AppFolio financial data in real time.

## Overview

The Cost Tracker gives Steiner Developers a single view of every construction project's financial position — from approved gate budgets and vendor contracts through to AppFolio-synced invoice actuals. Key capabilities:

- **Gate budgets** — Organize each project into approval phases (gates) with cost-category budgets
- **Contracts & SOV** — Track committed spend with Schedule of Values allocations per cost code
- **Change orders** — Full workflow (proposed → approved / rejected / voided) for both contract and budget-level COs
- **AppFolio sync** — Automatic and manual sync of vendor ledger transactions and balance sheet data
- **Reports** — PCM, Cost Detail, Vendor Detail, Commitment Detail, Change Order Log, Balance Sheet, Trial Balance, Gate Detail, and Reporting Package
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

## AppFolio Sync

Transactions are pulled from the AppFolio vendor ledger API:

- **Manual sync** — from Admin › AppFolio or automatically when running a PCM / Cost Detail / Vendor Detail report
- **Auto-sync** — daily Vercel Cron job at 6 AM UTC (requires `CRON_SECRET`)
- **Gate auto-assignment** — after every sync, transactions are matched to gates based on `bill_date` falling within a gate's `start_date`/`end_date` window

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access — user management, cost categories, AppFolio settings, all reports |
| **Project Manager** | Create/edit projects, gates, contracts, COs; reassign transaction gates; run reports |
| **Read Only** | View all data; no edits |

Admins see all projects. PMs and Read Only users see only projects they have been assigned to in Admin › Users & Access.

## Deployment

The app is deployed on Vercel. Environment variables are set in the Vercel project settings. The daily cron job is configured in `vercel.json`.

To deploy a new version, push to the configured production branch. Vercel builds automatically on push.

# KILN — Full Reconstruction Spec (single-file)

> Auto-generated concatenation of the `handoff/` set + the overview, in reading order.
> Cross-references between sections were written as separate files; in this merged
> document treat them as anchors within this same file. Generated 2026-05-29.

---

## Table of contents

1. Index & reconciliation notes
2. Overview + AppFolio integration
3. Config & build (verbatim)
4. Database schema + RLS
5. Reports (PCM engine)
6. Projects / contracts / draws / gates workflows
7. Admin / auth / monitoring
8. Components / UI / design system
9. API — Claude document extraction



<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/README.md -->
<!-- ============================================================ -->

# KILN — Full Reconstruction Spec (Toolbox Handoff)

This `handoff/` folder is a **rebuild-grade specification** of the KILN application
(real-estate development financial control system, app package name `kiln`,
brand "KILN — Where projects take shape." by RiverWest). It is written to be
**self-contained**: someone with no access to this repo should be able to
reconstruct the app from these documents alone.

Source repo: `riverwest-mike/steinerdeveloperscostreporting`.
Every file in the codebase has been reviewed; each section below quotes real
code / DDL for the non-trivial logic.

## How to read this

| File | Covers |
|------|--------|
| **`../KILN_TOOLBOX_HANDOFF.md`** | Top-level overview: stack, directory tree, auth model, the AI chat route, and the **full AppFolio integration** (§9 — connection, the 4 reports consumed, sync workflow, gate auto-assignment, property linking). Start here. |
| **`00-config-build.md`** | Every config file **verbatim** (package.json, next.config, vercel.json, tsconfig, tailwind, postcss, components.json, middleware, root layout, supabase client factories, access.ts), all env vars, build/run + stand-up order. |
| **`01-database.md`** | The **definitive final schema** after all 27 migrations (28 tables, every column/type/default/constraint/index/generated column), a migration-by-migration changelog, the full RLS layer (3 helper functions + every policy), setup order, gotchas. |
| **`02-reports.md`** | Every report. The **PCM 13-column (A–M) engine** with exact formulas + source, plus trial-balance, balance-sheet (Cash/Accrual), commitment-detail (SOV→col G), change-order log, gate-detail, cost/vendor-detail. Filter persistence, export, on-demand sync. |
| **`03-projects-workflows.md`** | Projects, gates (status machine + budget upload), contracts + **Schedule of Values**, the **change-order state machine** + budget roll-ups, **draw requests** + math, transaction category/gate/note overrides, vendors & documents. |
| **`04-admin-auth.md`** | Roles & permission matrix, the invite/provisioning flow, cost-category CRUD + the **full 94-row seed list**, audit log, admin-only monitoring (chat/activity/AI-usage), the `apply-migrations` route, auth pages. |
| **`05-components-ui.md`** | The complete **design-token set** (globals.css), layout/shell, brand logo, shadcn primitives, every shared component, dashboard widgets + their alert thresholds. |
| **`06-api-extraction.md`** | The two Claude document-extraction routes (contract + COI) — prompts and JSON shapes verbatim. |

## Stack (one-line)
Next.js 14.2.29 (App Router / RSC, all routes `force-dynamic`) · TypeScript (strict) ·
Tailwind 3.4 + shadcn/ui · Supabase (Postgres + RLS) · Clerk auth (with Clerk→Supabase
JWT template) · Anthropic Claude (`claude-sonnet-4-6` for chat + extraction) ·
AppFolio V2 Reporting API (Basic Auth) · Vercel (cron + production-only builds) ·
`xlsx`/SheetJS exports · `pg` used directly in a few admin spots alongside the Supabase client.

---

## Cross-section reconciliation notes (read these — agents surfaced real discrepancies)

These are the points where naming/labels in the code are misleading or where one
subsystem's assumption differs from another. Honor the **code behavior**, not the labels.

1. **`audit_log` (singular) is a DEAD table.** `schema.sql` defines `audit_log`
   (TABLE 16), but migration `20260305f_audit_logs.sql` creates **`audit_logs`**
   (plural) and that is the *only* one the application code ever reads/writes
   (login events, entity changes). Treat `audit_log` as vestigial; the live audit
   table is `audit_logs`. (See `01-database.md` for both DDLs, `04-admin-auth.md`
   for the write path in `lib/audit.ts`.)

2. **Cost-category seed is 94 rows, not 95.** `SEED_CATEGORIES` in
   `admin/cost-categories/seed-data.ts` has **94** entries, but the UI button/label
   hard-codes "95 default categories" / "Load defaults (95)". The full list is in
   `04-admin-auth.md`. Reproduce 94.

3. **`.kiln-table` exists but reports don't use it.** `globals.css` *does* define a
   `.kiln-table` component class (branded dark headers, 8 references — see
   `05-components-ui.md`). However, the **report pages do NOT apply it**; each report
   ships its own inline `@media print` landscape block (e.g. the fixed-column
   `#pcm-report` layout). Both facts are true — don't assume reports inherit `.kiln-table`.

4. **"One active gate per project" is enforced at the DB only.** There is a partial
   unique index `one_active_gate_per_project ... WHERE status='active'` (in
   `01-database.md`), but **no app-level guard** in the gate server actions
   (`03-projects-workflows.md`). If you re-platform the DB, keep that index or the
   invariant is lost.

5. **SOV balance check is client-only.** The "sum of Schedule-of-Values lines must
   equal contract value" rule (`Math.abs(diff) < 0.01`) is enforced in the browser
   only; the server action merely requires ≥1 SOV line with a category. A direct API
   caller could submit unbalanced SOV. (`03-projects-workflows.md`.)

6. **Draw "Previously Drawn" sums ALL other draws regardless of status** (code vs.
   comment discrepancy noted in `03-projects-workflows.md`) — i.e. draft/submitted/
   rejected draws all count toward prior-drawn. Decide intentionally if duplicating.

7. **`SyncStatusBanner` is defined but never mounted** by the current dashboard page
   (`05-components-ui.md`). Dead UI — include only if you want the feature.

8. **Env var name:** code reads **`APPFOLIO_DATABASE_URL`** (the AppFolio subdomain
   host); the README's `APPFOLIO_BASE_URL` is wrong. (`00-config-build.md`, overview §11.)

9. **README says "Next.js 15"** but the pin is **14.2.29**. Build on 14.

10. **Auth contract:** nearly all server code reads the user via the
    `x-clerk-user-id` request header injected by `middleware.ts` (not Clerk directly).
    Reports/admin/chat all use the **service-role** `createAdminClient()` and then
    re-apply project scoping in code via `getAccessibleProjectIds()` — RLS is a second
    layer, not the only one. Reproduce both the header injection and the in-code scoping.

11. **Security-sensitive surface:** `POST /api/admin/apply-migrations` runs arbitrary
    multi-statement DDL over a direct `pg`/`DATABASE_URL` connection (RLS-bypassing),
    guarded only by an admin/development_lead role check. And
    `app/api/admin/appfolio-map/route.ts` embeds ~70 real RiverWest property IDs/names
    inline. Both should be reconsidered before any wider exposure.

---

## Suggested reconstruction order
1. `00-config-build.md` — scaffold the Next.js app, configs, env.
2. `01-database.md` — stand up Supabase: schema → RLS → migrations → Clerk JWT template.
3. `../KILN_TOOLBOX_HANDOFF.md` — wire auth (middleware/header), Supabase clients, AppFolio sync.
4. `03-projects-workflows.md` — projects/gates/contracts/COs/draws CRUD + rules.
5. `02-reports.md` — the reporting engine (PCM first).
6. `04-admin-auth.md` — admin, users/invites, cost-category seed, monitoring.
7. `05-components-ui.md` — design system + shared components + dashboard.
8. `06-api-extraction.md` — Claude document extraction (optional/last).


<!-- ============================================================ -->
<!-- SOURCE FILE: KILN_TOOLBOX_HANDOFF.md -->
<!-- ============================================================ -->

# KILN → Riverwest Toolbox — Integration Handoff

> Prepared for the Toolbox Claude Code session to evaluate folding **KILN**
> (this app — real-estate development financial control system) into the
> Riverwest Toolbox application.
>
> Source repo: `riverwest-mike/steinerdeveloperscostreporting`
> App display name: **KILN** ("Where projects take shape." — by RiverWest)
> Package name: `kiln` (v0.1.0, private)

> **📁 This file is the overview. The full rebuild-grade spec lives in [`handoff/`](handoff/README.md).**
> Every file in the codebase was reviewed; `handoff/` contains verbatim configs, the
> definitive DB schema + RLS, the PCM calculation engine, all workflows, the design
> system, and admin/auth. **Read [`handoff/README.md`](handoff/README.md) first** — it
> includes a "cross-section reconciliation notes" block that corrects a few misleading
> labels in the code (and supersedes any contradicting detail in this overview, e.g.
> the `.kiln-table` usage nuance and the `audit_log` vs `audit_logs` dead-table point).

---

## 1. TL;DR — What KILN is

A Next.js 14 (App Router / RSC) web app that gives real-estate developers a
real-time financial view of every construction project: gate (phase) budgets,
vendor contracts + schedule-of-values, change orders, AppFolio-synced invoice
actuals, lender draw requests, a suite of financial reports, and a Claude-powered
chat assistant with live DB tool access.

**Stack at a glance**

| Layer | Tech |
|-------|------|
| Framework | Next.js **14.2.29** (App Router, React Server Components, `force-dynamic`) |
| Language | TypeScript 5.7 (strict), React 18.3 |
| Styling | Tailwind CSS 3.4 + shadcn/ui (Radix primitives), `next/font` (Inter + IBM Plex Mono) |
| DB | Supabase (PostgreSQL + Row Level Security) |
| Auth | Clerk (`@clerk/nextjs` v6.12) with Clerk→Supabase JWT template |
| AI | Anthropic Claude API (`@anthropic-ai/sdk` 0.78) — model `claude-sonnet-4-6` |
| External data | AppFolio V2 Reporting API (Basic Auth) |
| Deploy | Vercel (cron + production-only builds) |
| Excel | `xlsx` (SheetJS) for report exports |

> Note: `README.md` says "Next.js 15" but `package.json` pins **14.2.29**. Treat 14 as authoritative.

---

## 2. Full directory structure

```
app/
  (auth)/
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
  (dashboard)/                         # all authenticated routes; layout enforces auth + active user
    layout.tsx                         # force-dynamic; reads x-clerk-user-id header, loads role, renders DashboardShell
    dashboard/                         # home: project grid + alerts (budget, COI, lien waiver), pending COs, recent bills, chat input
    projects/
      page.tsx, new/page.tsx, project-form.tsx, actions.ts
      [id]/                            # project detail w/ tabbed UI:
        project-detail.tsx, project-tabs.tsx, map-tab.tsx
        contracts-section.tsx, contracts/...   # contracts + SOV + change orders
        draws-section.tsx, draws/...           # lender draw requests + Excel export
        gates-section.tsx, gates/...           # phase gates, budgets, upload-gates modal
        vendors-section.tsx, vendors/...
        documents-section.tsx, documents/...
    reports/                           # all financial reports (see §6)
      cost-management/ cost-detail/ vendor-detail/ commitment-detail/
      change-orders/ balance-sheet/ trial-balance/ gate-detail/ vendor-detail/
      [projectId]/                     # reporting-package landing (PCM + Balance Sheet)
    vendors/                           # cross-project vendor directory + vendor profile/docs
    admin/                             # admin/accounting/development_lead panel
      page.tsx, users/, cost-categories/, appfolio/, audit-log/
      monitoring/                      # true-admin only: chat-log, user-activity, ai-usage
  api/
    chat/route.ts                      # Claude agentic chat w/ 7 DB tools (see §5)
    webhooks/clerk/route.ts            # svix-verified Clerk user/session sync
    appfolio/sync, sync-preview, sync-balance-sheet, properties
    cron/daily-sync/route.ts           # Vercel cron 06:00 UTC, CRON_SECRET-protected
    admin/assign-gates, apply-migrations, appfolio-map
    extract-contract, extract-document # Claude-powered document field extraction
    draws/[drawId]/export              # xlsx draw schedule
    projects/[id]/gates/template       # xlsx budget-upload template
    activity/route.ts                  # user activity logging
  actions/                            # shared server actions (transaction category/gate/notes)
  layout.tsx                          # root: ClerkProvider + fonts + metadata
  globals.css                         # KILN brand tokens (see §7)
  icon.tsx, page.tsx, not-invited/page.tsx
components/
  layout/   dashboard-shell.tsx, header.tsx, sidebar.tsx, mobile-nav-trigger.tsx
  brand/    kiln-logo.tsx
  ui/       avatar, badge, button, dialog, separator (shadcn)
  ai-chat-widget.tsx, activity-tracker.tsx, address-autocomplete.tsx,
  column-picker.tsx, confirm-destructive.tsx, expandable-card.tsx, info-tip.tsx,
  page-help.tsx, project-multi-select.tsx, reporting-package-button.tsx,
  transaction-category-cell.tsx, transaction-gate-cell.tsx, transaction-note-cell.tsx,
  quickstart/quickstart-modal.tsx + trigger, time-greeting.tsx, local-time.tsx, unmatched-cost-modal.tsx
lib/
  supabase/server.ts                  # createClient (RLS via Clerk JWT) + createAdminClient (service role)
  supabase/client.ts                  # browser client
  access.ts                           # getAccessibleProjectIds(): null = admin/all, [] = scoped
  appfolio.ts                         # AppFolio V2 API client (485 lines)
  appfolio-sync-core.ts               # sync + gate auto-assignment logic (448 lines)
  audit.ts, help.ts, utils.ts, xlsx-helpers.ts
middleware.ts                         # Clerk middleware; forwards verified userId as x-clerk-user-id header
supabase/
  schema.sql                          # 18 core tables (410 lines)
  rls.sql                             # Row Level Security policies (430 lines)
  migrations/                         # 27 incremental .sql files (date-ordered)
  clerk-jwt-setup.md                  # Clerk↔Supabase JWT template setup guide
next.config.mjs, tailwind.config.ts, postcss.config.mjs, tsconfig.json,
components.json (shadcn), vercel.json, package.json, CLAUDE.md, README.md
```

---

## 3. Build & run

```bash
npm install
npm run dev        # next dev — http://localhost:3000
npm run build      # next build (PRODUCTION build — see deploy policy below)
npm run start
npm run lint       # next lint (eslint 8 + eslint-config-next)
```

- **Node 20+** (`@types/node` ^20). No `engines` pin in package.json.
- TS config: `strict`, `moduleResolution: bundler`, path alias `@/* → ./*`.
- `next.config.mjs`: `reactStrictMode`, `experimental.staleTimes.dynamic = 0`
  (router cache disabled so pages always re-fetch), Supabase storage remote image pattern.

### Deployment policy (IMPORTANT — from CLAUDE.md)
- **Vercel preview deploys are DISABLED on every branch except `main`** via
  `vercel.json` `ignoreCommand` (`[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0`).
- Every build that runs is a **production build that ships to users** — keep the
  deploy path lean; keep `dependencies` (vs `devDependencies`) tight (they ship in
  the serverless bundle); avoid heavy top-level work in `app/` files.
- Feature branches are pushed for review only — **no preview URL is generated**.
  Owner merges to `main` manually to ship.
- Daily cron defined in `vercel.json` → `/api/cron/daily-sync` at `0 6 * * *`.

---

## 4. Dependencies (full)

**dependencies**
```
@anthropic-ai/sdk ^0.78.0      @clerk/nextjs ^6.12.0
@radix-ui/react-{avatar,dialog,dropdown-menu,label,select,separator,slot,toast,tooltip}
@supabase/ssr ^0.5.2           @supabase/supabase-js ^2.49.1
@types/pg ^8.18.0              class-variance-authority ^0.7.1
clsx ^2.1.1                    lucide-react ^0.475.0
next 14.2.29                   pg ^8.20.0
react / react-dom ^18.3.1      react-markdown ^10.1.0
remark-gfm ^4.0.1              svix ^1.57.0   (Clerk webhook verification)
tailwind-merge ^2.6.0          tailwindcss-animate ^1.0.7
xlsx ^0.18.5
```
**devDependencies**: `@types/{node,react,react-dom}`, `autoprefixer`, `eslint` ^8.57,
`eslint-config-next` 14.2.29, `postcss`, `tailwindcss` ^3.4.17, `typescript` ^5.7.3.

> `pg` is used directly (raw SQL via `DATABASE_URL`) in a few report pages and the
> `apply-migrations` admin route — alongside the Supabase JS client. Two DB access
> paths coexist: Supabase client (RLS-aware + service-role) and raw `pg` pool.

---

## 5. Auth model & data access

**Clerk → middleware → header → server components**
- `middleware.ts` runs `clerkMiddleware`; public routes are `/sign-in`, `/sign-up`,
  `/not-invited`, `/api/webhooks/*`. For everything else it requires a `userId`,
  strips any client-supplied `x-clerk-user-id`, and **re-injects the verified userId
  as `x-clerk-user-id`** on the forwarded request (works around unreliable Clerk
  header propagation on Vercel Edge→Node).
- `(dashboard)/layout.tsx` reads that header, loads the user row via the **admin
  (service-role) client**, redirects to `/not-invited` if no row, `/sign-in?error=inactive`
  if deactivated, else renders `DashboardShell` with the role.

**Supabase access (`lib/supabase/server.ts`)**
- `createClient()` — SSR client authenticated with a Clerk JWT (`getToken({ template: "supabase" })`).
  RLS policies evaluate against the Clerk user id (`auth.jwt() ->> 'sub'`).
- `createAdminClient()` — service-role client, **bypasses RLS**. Used in webhooks,
  cron, the chat route, and the dashboard layout.
- Clerk↔Supabase JWT template setup is documented in `supabase/clerk-jwt-setup.md`
  (template name must be exactly `supabase`, HS256, signed with the Supabase JWT secret).

**Roles** (`users.role`): `admin`, `accounting`, `project_manager`, `read_only`,
plus `development_lead` (added in migration `20260312`). `lib/access.ts`
`getAccessibleProjectIds()` returns `null` for admin/accounting/development_lead
(all projects) or the assigned project-id list for PM/read_only. Full permission
matrix is in `README.md` §"User Roles".

**Clerk webhook** (`/api/webhooks/clerk`, svix-verified): handles `user.created`
(provision Supabase row; invited users get role from `public_metadata.role` + are
active; direct/self-signups become inactive `read_only`), `user.updated`,
`session.created` (stamps `last_login_at` + login audit), `user.deleted` (soft-delete
via `is_active=false`). Also auto-assigns projects from `pending_project_assignments`.

---

## 6. AI assistant (the most "toolbox-like" piece)

`app/api/chat/route.ts` — a self-contained agentic chat endpoint:
- Auth via `x-clerk-user-id`; resolves role + accessible project IDs.
- Model `claude-sonnet-4-6`, `max_tokens: 2048`, system prompt cached
  (`cache_control: ephemeral`), agentic loop up to **8 iterations** until `end_turn`.
- **7 DB tools** (all access-scoped to the user's projects):
  `list_projects`, `get_project_financials`, `summarize_spend`, `query_transactions`,
  `get_change_orders`, `get_gates`, `get_contracts`.
- Tool execution uses the **admin client** but every tool re-checks
  `accessibleProjectIds`/`isAdmin` before returning data.
- System prompt teaches it to emit internal app links (e.g.
  `/reports/cost-management?projectIds=...`) for navigation.
- Logs every call: token usage + computed `cost_usd` → `ai_usage_logs`, full
  transcript → `chat_logs` (best-effort, never blocks response).
- Response is streamed back as plain text (single chunk).

Other Claude usage: `/api/extract-contract` and `/api/extract-document` (field
extraction from uploaded docs). UI surface: `components/ai-chat-widget.tsx` +
`dashboard/dashboard-chat-input.tsx`.

> For toolbox integration this chat route is largely portable: it has no shared
> state beyond Supabase + env vars, and the tool definitions are inline.

---

## 7. Database schema (Supabase / PostgreSQL)

`supabase/schema.sql` defines **18 core tables** (+ `pgcrypto`). RLS in `rls.sql`
(helper `is_admin()`, JWT `sub`-based policies). 27 migrations layer on more.

Core tables:
1. `users` — mirror of Clerk users; `id = Clerk user id` (TEXT PK); role CHECK
   (admin/project_manager/read_only/accounting — `development_lead` added by migration), `is_active`.
2. `projects` — name/code(unique)/`appfolio_property_id`/address/property_type
   (Multifamily/MHP/Commercial/Mixed-Use/Land/Other)/status/`image_url`.
3. `cost_categories` — name+code unique, `display_order`, `is_active`.
4. `project_documents` — files (category: Legal/Financial/Design/Other).
5. `project_users` — user↔project junction (drives PM/read_only scoping).
6. `gates` — project phases; `sequence_number`, status (pending/active/closed),
   `start_date`/`end_date`; **partial unique index: one active gate per project**.
7. `appfolio_syncs` — sync run log (scheduled/manual, counts, status).
8. `budget_imports` — budget upload batches.
9. `gate_budgets` — per gate+category; `revised_budget` GENERATED = original + approved_co.
10. `contracts` — committed spend; `revised_value` GENERATED; retainage, dates, status.
11. `change_orders` — proposed/approved/rejected/voided; contract- or gate-level.
12. `appfolio_transactions` — synced vendor-ledger bills; `appfolio_bill_id` unique;
    parsed `cost_category_code`/`name`; paid/unpaid/payment_status; indexed by property/bill_date/vendor/code.
13. `bridge_mappings` — vendor/GL→cost-category mapping rules (exact/contains/starts_with, priority).
14. `transaction_mappings` — explicit txn→project/gate/category/contract mapping; `net_amount` GENERATED.
15. `retainage_releases`.
16. `audit_log` — immutable (no UPDATE/DELETE policy); old/new JSONB.
17. `gl_balances` — AppFolio balance-sheet rows (Cash/Accrual basis).
18. `transaction_gate_assignments` — lightweight txn→gate, auto-assigned by bill_date
    vs gate window, admin/PM override; ships with its own RLS policies inline in schema.sql.

Tables added via **migrations** (not in schema.sql):
- `audit_logs` (newer audit table used by webhook/login; distinct from `audit_log`),
- `pending_project_assignments`,
- `chat_logs`, `user_activity_logs`, `ai_usage_logs` (migration `20260312_development_lead_and_logging.sql`),
- plus columns: transaction cost-category/notes, project `image_url`, contract gates,
  contract line items (SOV), draw_requests, project vendors/documents storage, vendor
  documents, project PM, `user.last_login_at`, accounting role, MHP property type,
  cost_category override, etc. (27 files, date-ordered `2026-03-04` → `2026-03-13`).

> DB setup order: run `schema.sql`, then `rls.sql`, then migrations in date order,
> then the Clerk JWT template (`clerk-jwt-setup.md`). An in-app
> `/api/admin/apply-migrations` route can apply migrations via `pg`/`DATABASE_URL`.

---

## 8. Reports (the product surface)

PCM (13-column budget-vs-actual), Cost Detail, Vendor Detail, Commitment Detail,
Change Order Log, Balance Sheet, Trial Balance, Gate Detail, Reporting Package
(PCM + Balance Sheet for client deliverables). Each report page has a
`report-controls.tsx` (filters), most have `report-restorer.tsx` (restore filter
state) and `export-buttons.tsx` (xlsx/print). Tables use the shared `.kiln-table`
CSS class (branded headers that survive printing).

---

## 9. AppFolio integration (full detail)

This is the most involved external coupling. Two files do the work — `lib/appfolio.ts`
(the API client) and `lib/appfolio-sync-core.ts` (the sync + post-processing) — plus a
set of API routes and admin UI for linking and triggering.

### 9.1 Connection / auth
- **AppFolio V2 Reporting API.** Base URL: `https://${APPFOLIO_DATABASE_URL}/api/v2/reports`
  (e.g. `https://riverwest.appfolio.com/api/v2/reports`).
- **HTTP Basic Auth**: `Authorization: Basic base64(APPFOLIO_CLIENT_ID:APPFOLIO_CLIENT_SECRET)`.
  No token exchange / OAuth — credentials are sent on every request.
- All report calls are `POST <report>.json` with a JSON body of filter params and
  `paginate_results: true`. **Pagination quirk:** the first page is a POST; each
  subsequent `next_page_url` is followed with a **GET** (cursor embedded in the URL).
  `next_page_url` may be relative, so it's resolved against the base host.
  All fetches use `cache: "no-store"`.

### 9.2 Reports consumed (all in `lib/appfolio.ts`)
| Function | Endpoint | Key params | Used for |
|----------|----------|-----------|----------|
| `fetchVendorLedger()` | `vendor_ledger.json` | `occurred_on_from/to`, `properties.properties_ids`, `payment_status` | **Primary sync source** — bills + Project Cost Category |
| `fetchBillDetail()` | `bill_detail.json` | same | Property discovery; alt bill view |
| `fetchBalanceSheet()` | `balance_sheet.json` | `as_of_date`, `accounting_basis` (Cash/Accrual) | Balance Sheet report / `gl_balances` |
| `fetchGeneralLedger()` | `general_ledger.json` | `posted_on_from/to`, `accounting_basis: Accrual` | GL / trial balance support |

**Response-shape resilience:** AppFolio is inconsistent about JSON shapes and field
casing, and the code defends against it heavily:
- `getProjectCostCategory(row)` reads the cost-category field across variants
  (`project_cost_category`, `Project_Cost_Category`, `projectCostCategory`, `cost_category`).
- `parseCostCategory("010700 Survey")` → `{ code: "010700", name: "Survey" }`
  (splits on first space; digits-led code).
- `extractRows()` for balance sheet handles **5 different response shapes**
  (`{results}`, bare array, `{data}`, `{balance_sheet:[...]}`, and nested
  `{balance_sheet:{sections:[{accounts}]}}`), throwing a diagnostic error with the raw
  shape if none match. Amounts arrive as strings (`"3327.50"`) and are `parseFloat`'d.

### 9.3 Sync workflow — `runAppfolioSync()` (`lib/appfolio-sync-core.ts`)
The shared core used by both the manual and cron endpoints:
1. Insert an `appfolio_syncs` row (`status: running`, `sync_type`, `triggered_by`).
2. Load `projects` where `appfolio_property_id` is set (optionally filtered to one property).
   If none, complete the sync as a no-op.
3. `fetchVendorLedger({ propertyIds, fromDate, toDate, paymentStatus: "All" })`.
   **Default date window:** from = 1 year ago, to = **yesterday** (today is excluded
   because AppFolio returns unposted pending records for the current day).
4. Map each row → transaction record in batches of 100:
   - `appfolio_bill_id = payable_invoice_detail_id` (the unique upsert key),
   - `invoice_amount = paid + unpaid`, `payment_status` derived (`Paid`/`Unpaid`/`Partial`),
   - cost code/name parsed from the Project Cost Category field.
5. **Dedup** within the batch by `appfolio_bill_id`, preferring the row that has a cost code.
6. **Preserve existing categorization** — fetch current DB rows for those bill IDs:
   - a manual UI override (`cost_category_code_override`) **always wins**;
   - if AppFolio returns no code, the previously stored DB value is kept.
   - rows that end up with no code increment `records_unmapped`.
7. `upsert(..., { onConflict: "appfolio_bill_id" })` into `appfolio_transactions`.
8. **`autoAssignGates()`** — for every transaction (by property→project), find the gate
   whose `start_date <= bill_date <= end_date` (only `active`/`closed` gates with date
   windows; lowest `sequence_number` wins ties), and upsert into
   `transaction_gate_assignments`. **Manual overrides (`is_override = true`) are never
   overwritten.** Unmatched transactions are left unassigned.
9. **`autoUpsertVendors()`** — collect unique `(project_id, vendor_name)` pairs from the
   synced rows and upsert into `project_vendors` (`onConflict: project_id,name`,
   ignore duplicates) so the per-project vendor directory stays in sync automatically.
10. Mark the `appfolio_syncs` row `completed` with counts (fetched/upserted/unmapped),
    or `failed` with `error_message` on throw.

`SyncResult` returns `{ syncId, status, records_fetched, records_upserted,
records_unmapped, projects_synced, date_range }`.

### 9.4 Balance-sheet sync — `/api/appfolio/sync-balance-sheet`
Separate from the vendor-ledger core. Iterates **one property at a time** (AppFolio
doesn't include `property_id` per balance-sheet row, so the caller must scope each
request), maps rows defensively (tries many field-name variants for account id/type),
and upserts into `gl_balances` keyed by
`(appfolio_property_id, gl_account_id, as_of_date, accounting_basis)`. Defaults: as-of =
today, basis = Accrual.

### 9.5 Triggers & auth gating
- **Manual full sync:** `POST /api/appfolio/sync` (no `propertyId`) — requires
  `admin`/`accounting`/`development_lead`. Single-property sync (with `propertyId`) is
  allowed for any authenticated user.
- **Daily cron:** `GET /api/cron/daily-sync` — Vercel injects
  `Authorization: Bearer $CRON_SECRET`; the route rejects anything else. Runs as
  `sync_type: scheduled`, `triggered_by: null`. Schedule `0 6 * * *` in `vercel.json`.
- **Preview/debug:** `GET /api/appfolio/sync-preview?property_id=…` (admin) does the exact
  same fetch as the real sync and returns a side-by-side AppFolio-vs-DB comparison —
  useful for diagnosing why a code didn't store. (Reports also trigger on-demand syncs.)

### 9.6 Linking projects → AppFolio properties (3 mechanisms)
The link is a single column: `projects.appfolio_property_id` (TEXT). Everything keys off it.
1. **Property discovery:** `GET /api/appfolio/properties` (admin) scans `bill_detail` over
   the last 2 years and returns unique `{id, name, address}` properties for lookup.
2. **Manual entry:** `admin/appfolio/link-projects.tsx` lists active projects with no
   property ID and has the user paste the numeric ID (found in the AppFolio property URL
   `/properties/<ID>/edit`). Saves via the `linkAppfolioId` server action.
3. **Fuzzy auto-map:** `GET/POST /api/admin/appfolio-map` suggests matches by name
   similarity (normalizes out `llc/inc/the/fka`, Jaccard word overlap, ≥0.4 threshold)
   and bulk-applies chosen mappings.
   ⚠️ **This route currently hardcodes ~70 real RiverWest AppFolio property IDs + names
   inline** (a snapshot of the live portfolio). Flag for the Toolbox session — that list
   should be fetched from `/api/appfolio/properties` (or a table) rather than committed
   to source.

### 9.7 DB tables touched by AppFolio
`appfolio_syncs` (run log), `appfolio_transactions` (bills), `transaction_gate_assignments`
(auto-assigned), `project_vendors` (auto-upserted directory), `gl_balances` (balance sheet),
`projects.appfolio_property_id` (the link).

---

## 10. Branding / design system (§7 globals.css)

KILN palette (CSS HSL custom properties, light-only theme; sidebar carries its own
dark tokens):
- Terracotta `#C4552D` (primary / sidebar active)
- Charcoal `#141414` (sidebar surface, foreground)
- Slate `#3A3F44`, Warm Gray `#E6E2DD` (neutral surfaces/borders)
- Signal Blue `#2563EB` (info), Approval Green `#16A34A` (success)
- Status tokens for project status (active/hold/complete/archived).
- Fonts: Inter (sans, `--font-sans`) + IBM Plex Mono (`--font-mono`) via `next/font`.
  (Brand display face is Söhne Heavy — not licensed; Inter is the stand-in, noted in `app/layout.tsx`.)
- shadcn config: `style: default`, `baseColor: slate`, CSS variables, RSC enabled.

---

## 11. Environment variables (complete)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                     # direct Postgres (pg pool) — reports + apply-migrations
SUPABASE_ACCESS_TOKEN=            # used by apply-migrations tooling

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=             # svix verification
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# AppFolio  (NOTE: code uses APPFOLIO_DATABASE_URL, README says APPFOLIO_BASE_URL)
APPFOLIO_CLIENT_ID=
APPFOLIO_CLIENT_SECRET=
APPFOLIO_DATABASE_URL=            # e.g. your-company.appfolio.com  (code reads THIS)

# Anthropic
ANTHROPIC_API_KEY=                # SDK reads from env automatically

# Misc
CRON_SECRET=                      # protects /api/cron/daily-sync
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # address-autocomplete + project map tab
```

> Discrepancy to flag: README documents `APPFOLIO_BASE_URL` but `lib/appfolio.ts`
> reads `APPFOLIO_DATABASE_URL`. Use `APPFOLIO_DATABASE_URL`.

---

## 12. Integration notes / things the Toolbox session should weigh

1. **Auth coupling**: deeply tied to Clerk (middleware header injection + JWT
   template + webhook provisioning). If Toolbox uses different auth, the
   `x-clerk-user-id` header contract and Clerk→Supabase JWT need replacing, and
   `lib/supabase/server.ts` + `lib/access.ts` + `(dashboard)/layout.tsx` are the seams.
2. **Two DB access paths**: Supabase JS (RLS + service-role) AND raw `pg`. A merge
   should standardize on one. RLS policies assume `auth.jwt() ->> 'sub'` = Clerk id.
3. **Route groups**: everything user-facing lives under `app/(dashboard)/`; it's a
   self-contained module that could mount under a Toolbox path/segment with minimal
   route rewrites, but it assumes it owns the root layout (ClerkProvider, fonts).
4. **Shared brand tokens**: KILN's palette is in `globals.css` `:root`. Merging into
   a Toolbox design system means namespacing or reconciling these CSS variables.
5. **Server actions + force-dynamic**: pages are dynamic (no static caching;
   `staleTimes.dynamic = 0`). Fine for an internal tool; note bundle/runtime cost.
6. **AI chat route is the cleanest lift** — portable Claude agentic endpoint with
   inline tool defs; only depends on Supabase + `ANTHROPIC_API_KEY`.
7. **AppFolio + cron are external-facing infra** — cron is configured in `vercel.json`;
   if Toolbox already has scheduled infra, reuse it rather than duplicating (CLAUDE.md
   explicitly says to reuse existing cron/webhook routes).
8. **Deploy discipline**: production-only builds, lean `dependencies`. Whatever the
   merge strategy, don't widen Vercel preview builds and keep runtime deps tight.
9. **Schema is the heavy artifact**: 18 core tables + 27 migrations + RLS. Decide
   whether KILN keeps its own Supabase project/schema (namespaced) or merges into a
   shared Toolbox DB (table-name collisions to watch: `users`, `audit_log` vs
   `audit_logs`, generic names like `gates`, `contracts`).
10. **AppFolio is the heaviest external coupling** (see §9): Basic-Auth report API with
    quirky pagination + inconsistent JSON shapes the code defends against. The whole
    integration hangs off one column (`projects.appfolio_property_id`) and a shared
    `runAppfolioSync()` core reused by cron + manual routes — portable, but bring the
    response-shape defenses with it.
11. **Hardcoded portfolio data**: `app/api/admin/appfolio-map/route.ts` embeds ~70 real
    AppFolio property IDs/names inline. Before any wider exposure, replace it with a
    runtime fetch (`/api/appfolio/properties`) or a config table.

---

## 13. Quick file-reading order for the Toolbox session

1. `README.md` + `CLAUDE.md` (product + deploy policy)
2. `package.json`, `next.config.mjs`, `vercel.json`, `tsconfig.json`
3. `middleware.ts` + `app/(dashboard)/layout.tsx` (auth flow)
4. `lib/supabase/server.ts`, `lib/access.ts`, `supabase/clerk-jwt-setup.md`
5. `supabase/schema.sql` + `supabase/rls.sql` + skim `supabase/migrations/`
6. `app/api/chat/route.ts` (AI surface)
7. `lib/appfolio.ts` + `lib/appfolio-sync-core.ts` (external sync)
8. `components/layout/sidebar.tsx` (nav / feature map)
9. `app/globals.css` (brand tokens)


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/00-config-build.md -->
<!-- ============================================================ -->

# 00 — Config & Build (verbatim)

> Every project config file copied exactly, plus env vars and build/run steps.
> The rest of the reconstruction spec lives in the sibling files:
> `01-database.md`, `02-reports.md`, `03-projects-workflows.md`,
> `04-admin-auth.md`, `05-components-ui.md`, `06-api-extraction.md`, and the
> top-level `KILN_TOOLBOX_HANDOFF.md` (overview + AppFolio + auth).

App: **KILN** ("Where projects take shape." — by RiverWest). Package name `kiln`.

---

## package.json
```json
{
  "name": "kiln",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@clerk/nextjs": "^6.12.0",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-toast": "^1.2.6",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.49.1",
    "@types/pg": "^8.18.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.475.0",
    "next": "14.2.29",
    "pg": "^8.20.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "svix": "^1.57.0",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^20.17.24",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.1",
    "eslint-config-next": "14.2.29",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3"
  }
}
```
> No `engines` pin; build with **Node 20+**. README says "Next.js 15" but the
> pin is **14.2.29** — 14 is authoritative.

---

## next.config.mjs
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable client-side router cache so pages always re-fetch when navigated to.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        // Supabase storage — project cover images
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
```

---

## vercel.json
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ] && exit 0 || exit 1",
  "crons": [
    {
      "path": "/api/cron/daily-sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```
> `ignoreCommand` makes Vercel **build only on `main`** — feature branches get no
> preview deploy. The single cron hits `/api/cron/daily-sync` at 06:00 UTC.

---

## tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
> Path alias `@/* → ./*` is used everywhere (e.g. `@/lib/...`, `@/components/...`).

---

## tailwind.config.ts
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```
> All color values are CSS variables defined in `app/globals.css` (see `05-components-ui.md`).

---

## postcss.config.mjs
```js
/** @type {import('postcss').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

---

## components.json (shadcn/ui)
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## middleware.ts (Clerk auth + userId header injection)
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/not-invited(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
    // Forward the verified userId as a request header so server components can
    // read it via next/headers (works around unreliable Clerk header propagation
    // in Vercel Edge → Node.js with @clerk/nextjs v6.39+).
    const requestHeaders = new Headers(req.headers);
    requestHeaders.delete("x-clerk-user-id"); // strip any client-supplied value
    requestHeaders.set("x-clerk-user-id", userId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```
> **Key architectural contract:** every server component / API route reads the
> authenticated user via the `x-clerk-user-id` request header, NOT directly from
> Clerk in most places. Reproduce this exactly or the whole auth/data flow breaks.

---

## app/layout.tsx (root)
```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "KILN — Where projects take shape.",
  description: "KILN is the financial control system for real estate development. Control commitments. Forecast exposure. Approve with confidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```
> Brand display face is **Söhne Heavy** (commercial license required); Inter is the
> stand-in until the foundry license is in place.

---

## lib/supabase/server.ts (verbatim — the two client factories)
```ts
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/** RLS-aware client authenticated with the Clerk JWT (template "supabase"). */
export async function createClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  let supabaseToken: string | null = null;
  try {
    supabaseToken = await getToken({ template: "supabase" });
  } catch (err) {
    console.error("[supabase/server] getToken failed:", err);
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : {} },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Component — cookie writes ignored */ }
        },
      },
    }
  );
}

/** Service-role client — BYPASSES RLS. Use only in trusted server contexts. */
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

## lib/supabase/client.ts
```ts
import { createBrowserClient } from "@supabase/ssr";
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

## lib/access.ts (project scoping)
```ts
import { createAdminClient } from "./supabase/server";

/** null = admin/accounting/development_lead (all projects); string[] = scoped IDs. */
export async function getAccessibleProjectIds(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string | null
): Promise<string[] | null> {
  if (!userId) return null;
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  const role = (data as { role?: string } | null)?.role;
  if (!role || role === "admin" || role === "accounting" || role === "development_lead") return null;
  const { data: access } = await supabase.from("project_users").select("project_id").eq("user_id", userId);
  return (access ?? []).map((a: { project_id: string }) => a.project_id);
}
```

---

## Environment variables (complete)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                     # direct Postgres (pg pool) — some report pages + apply-migrations
SUPABASE_ACCESS_TOKEN=            # used by apply-migrations tooling

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=             # svix verification for /api/webhooks/clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# AppFolio  (code reads APPFOLIO_DATABASE_URL — README's APPFOLIO_BASE_URL is wrong)
APPFOLIO_CLIENT_ID=
APPFOLIO_CLIENT_SECRET=
APPFOLIO_DATABASE_URL=            # e.g. your-company.appfolio.com

# Anthropic (chat + document extraction)
ANTHROPIC_API_KEY=                # SDK reads this from env automatically

# Misc
CRON_SECRET=                      # protects GET /api/cron/daily-sync (Bearer)
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # address-autocomplete + project map tab
```

---

## .gitignore (essentials)
Standard Next.js ignore: `/node_modules`, `/.next/`, `/out/`, `/build`, `.env*.local`,
`.env`, `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`, `.DS_Store`, `*.pem`, debug logs.

---

## Build / run
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # PRODUCTION build (see deploy policy)
npm run start
npm run lint
```

### Deploy policy (from CLAUDE.md — reproduce intentionally)
- Vercel preview deploys are **disabled on every branch except `main`** (via the
  `vercel.json` `ignoreCommand`). Feature branches push for review only — no preview URL.
- Every build that runs is a **production build that ships to users** → keep
  `dependencies` tight (they ship in the serverless bundle), avoid heavy top-level
  work in `app/` files, reuse the existing cron/webhook routes.

### Stand-up order
1. Create Supabase project; run `01-database.md` schema → RLS → migrations in order.
2. Configure Clerk app + the **`supabase` JWT template** (HS256, signed with the
   Supabase JWT secret — see `01-database.md` / clerk-jwt-setup).
3. Set all env vars (above) in Vercel + local `.env.local`.
4. Point the Clerk webhook at `/api/webhooks/clerk` (events: user.created/updated/deleted,
   session.created) with `CLERK_WEBHOOK_SECRET`.
5. Set AppFolio creds; link each project's `appfolio_property_id` (see overview §9.6).
6. Deploy to `main`; the daily cron starts syncing.


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/01-database.md -->
<!-- ============================================================ -->

# KILN Database Reconstruction Spec

This document describes the **complete, final state** of the KILN (a.k.a. River
West Cost Tracker) database after `schema.sql`, `rls.sql`, and all 27 migrations
(dated 2026-03-04 → 2026-03-13) have been applied, in order. It is written so an
engineer with **no repo access** can recreate the database exactly.

Stack: Next.js + Supabase (Postgres). Authentication is Clerk; Supabase RLS reads
the Clerk user ID from the JWT `sub` claim. Server-side code uses the Supabase
**service-role** key (`createAdminClient`) which bypasses RLS for sync/webhook/
audit writes.

Extensions required:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()
```

---

## TABLE OF CONTENTS

1. [Definitive Final Schema](#1-definitive-final-schema)
2. [Migration-by-Migration Changelog](#2-migration-by-migration-changelog)
3. [Row Level Security](#3-row-level-security)
4. [Triggers / Functions](#4-triggers--functions)
5. [Setup Order](#5-setup-order)
6. [Gotchas](#6-gotchas)

---

# 1. Definitive Final Schema

**Total tables: 28** (in the `public` schema). 18 originate in `schema.sql`; 10
are added by migrations. There is also 1 Supabase Storage bucket
(`project-documents`) and storage object policies.

Tables created in `schema.sql` (original 18):
`users`, `projects`, `cost_categories`, `project_documents`, `project_users`,
`gates`, `appfolio_syncs`, `budget_imports`, `gate_budgets`, `contracts`,
`change_orders`, `appfolio_transactions`, `bridge_mappings`,
`transaction_mappings`, `retainage_releases`, `audit_log`, `gl_balances`,
`transaction_gate_assignments`.

Tables added by migrations (10):
`contract_gates`, `contract_line_items`, `audit_logs`, `transaction_notes`,
`project_vendors`, `vendor_documents`, `pending_project_assignments`,
`draw_requests`, `draw_request_lines`, `chat_logs`, `user_activity_logs`,
`ai_usage_logs`.

> Note: that bullet lists 12 names — `transaction_gate_assignments` ALSO has a
> standalone migration (`20260308`) but it already exists in `schema.sql`, so it
> is counted in the original 18. The three logging tables in `20260312`
> (`chat_logs`, `user_activity_logs`, `ai_usage_logs`) push the migration-added
> count to 12 distinct new tables. **Grand total distinct tables = 28** in
> `public`.

Each block below reflects the FINAL state (original DDL + migration changes
merged). Columns added by migrations are flagged with `-- [added by <file>]`.

---

### 1.1 `users` — mirror of Clerk users (id = Clerk user ID)

```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,                       -- = Clerk user ID, NOT auto-generated
  email        TEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL
                 CHECK (role IN ('admin', 'project_manager', 'read_only',
                                 'accounting', 'development_lead')),  -- final set
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ                              -- [added by 20260310c]
);
```

Role CHECK history: original was `('admin','project_manager','read_only')`;
`20260310e` added `accounting`; `20260312` added `development_lead`. The
constraint is named `users_role_check` (it is dropped/recreated by those
migrations).

---

### 1.2 `projects`

```sql
CREATE TABLE projects (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  code                   TEXT NOT NULL UNIQUE,
  appfolio_property_id   TEXT,
  address                TEXT,
  city                   TEXT,
  state                  TEXT,
  property_type          TEXT
                           CHECK (property_type IN ('Multifamily', 'MHP',
                             'Commercial', 'Mixed-Use', 'Land', 'Other')),  -- MHP added by 20260310f
  total_units            INTEGER,
  total_sf               INTEGER,
  acquisition_date       DATE,
  expected_completion    DATE,
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  description            TEXT,
  image_url              TEXT,                            -- in schema.sql; re-added by 20260305/20260305c
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             TEXT NOT NULL REFERENCES users(id),
  pm_user_id             TEXT REFERENCES users(id),       -- [added by 20260310b]
  lender                 TEXT,                            -- [added by 20260310g]
  pending_pm_email       TEXT                             -- [added by 20260311]
);
```

`property_type` constraint is named `projects_property_type_check` (dropped/
recreated by `20260310f`). `pm_user_id` and `pending_pm_email` are mutually
exclusive by application convention (one is NULL when the other is set).

---

### 1.3 `cost_categories`

```sql
CREATE TABLE cost_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  display_order   INTEGER NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL REFERENCES users(id)
);
```

---

### 1.4 `project_documents`

```sql
CREATE TABLE project_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  category     TEXT CHECK (category IN ('Legal', 'Financial', 'Design', 'Other')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT NOT NULL REFERENCES users(id)
);
```

(`20260309b` re-runs this `CREATE TABLE IF NOT EXISTS` idempotently and adds the
`project-documents` storage bucket — see migration log §2.16.)

---

### 1.5 `project_users` — junction user ↔ project

```sql
CREATE TABLE project_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   TEXT NOT NULL REFERENCES users(id),
  UNIQUE(project_id, user_id)
);
```

This is the scoping table read by `is_assigned_to_project()` for PM/read-only RLS.

---

### 1.6 `gates`

```sql
CREATE TABLE gates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  sequence_number   INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'closed')),
  is_locked         BOOLEAN NOT NULL DEFAULT false,
  start_date        DATE,
  end_date          DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  closed_by         TEXT REFERENCES users(id),
  created_by        TEXT NOT NULL REFERENCES users(id),
  UNIQUE(project_id, sequence_number)
);

-- Only one ACTIVE gate per project at a time (partial unique index):
CREATE UNIQUE INDEX one_active_gate_per_project
  ON gates(project_id)
  WHERE status = 'active';
```

---

### 1.7 `appfolio_syncs` (must exist before `appfolio_transactions` / `gl_balances`)

```sql
CREATE TABLE appfolio_syncs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by        TEXT REFERENCES users(id),
  sync_type           TEXT NOT NULL CHECK (sync_type IN ('scheduled', 'manual')),
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  records_fetched     INTEGER,
  records_upserted    INTEGER,
  records_unmapped    INTEGER,
  error_message       TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);
```

---

### 1.8 `budget_imports` (must exist before `gate_budgets`)

```sql
CREATE TABLE budget_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id),       -- no ON DELETE
  gate_id       UUID NOT NULL REFERENCES gates(id),          -- no ON DELETE
  filename      TEXT NOT NULL,
  row_count     INTEGER NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by   TEXT NOT NULL REFERENCES users(id),
  notes         TEXT
);
```

---

### 1.9 `gate_budgets`

```sql
CREATE TABLE gate_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id               UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  cost_category_id      UUID NOT NULL REFERENCES cost_categories(id),
  original_budget       NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_co_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  revised_budget        NUMERIC(15,2)
                          GENERATED ALWAYS AS (original_budget + approved_co_amount) STORED,
  import_batch_id       UUID REFERENCES budget_imports(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT NOT NULL REFERENCES users(id),
  UNIQUE(gate_id, cost_category_id)
);
```

`revised_budget` is a STORED GENERATED column — never insert/update it directly.

---

### 1.10 `contracts`

```sql
CREATE TABLE contracts (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate_id                      UUID REFERENCES gates(id),         -- NOT NULL dropped by 20260305d
  cost_category_id             UUID NOT NULL REFERENCES cost_categories(id),
  vendor_name                  TEXT NOT NULL,
  contract_number              TEXT,
  description                  TEXT NOT NULL,
  original_value               NUMERIC(15,2) NOT NULL,
  approved_co_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  revised_value                NUMERIC(15,2)
                                 GENERATED ALWAYS AS (original_value + approved_co_amount) STORED,
  retainage_pct                NUMERIC(5,2) NOT NULL DEFAULT 0,
  execution_date               DATE,
  substantial_completion_date  DATE,
  status                       TEXT NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'complete', 'terminated')),
  teams_url                    TEXT,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                   TEXT NOT NULL REFERENCES users(id)
);
```

`gate_id` was originally `NOT NULL`; `20260305d` dropped NOT NULL so a contract
can span multiple gates via the `contract_gates` junction (the single `gate_id`
is now only a fallback default gate). `revised_value` is STORED GENERATED.

---

### 1.11 `change_orders`

```sql
CREATE TABLE change_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate_id           UUID NOT NULL REFERENCES gates(id),
  contract_id       UUID REFERENCES contracts(id),               -- nullable (budget-level COs)
  cost_category_id  UUID NOT NULL REFERENCES cost_categories(id),
  co_number         TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed', 'approved', 'rejected', 'voided')),
  proposed_date     DATE NOT NULL,
  approved_date     DATE,
  approved_by       TEXT REFERENCES users(id),
  teams_url         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL REFERENCES users(id),
  rejection_reason  TEXT                                          -- [added by 20260306]
);
```

---

### 1.12 `appfolio_transactions`

```sql
CREATE TABLE appfolio_transactions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_bill_id            TEXT NOT NULL UNIQUE,
  appfolio_property_id        TEXT NOT NULL,
  vendor_name                 TEXT NOT NULL,
  gl_account_id               TEXT NOT NULL DEFAULT '',           -- DEFAULT '' set by 20260304
  gl_account_name             TEXT NOT NULL DEFAULT '',           -- DEFAULT '' set by 20260304
  cost_category_code          TEXT,                               -- [added by 20260304]
  cost_category_name          TEXT,                               -- [added by 20260304]
  bill_date                   DATE,
  due_date                    DATE,
  payment_date                DATE,
  invoice_amount              NUMERIC(15,2) NOT NULL,
  paid_amount                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  unpaid_amount               NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_type                TEXT,
  check_number                TEXT,
  payment_status              TEXT NOT NULL,
  reference_number            TEXT,
  description                 TEXT,
  property_name               TEXT,
  sync_id                     UUID NOT NULL REFERENCES appfolio_syncs(id),
  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cost_category_code_override TEXT,                               -- [added by 20260313]
  cost_category_name_override TEXT,                               -- [added by 20260313]
  cost_category_override_by   TEXT REFERENCES users(id) ON DELETE SET NULL,  -- [added by 20260313]
  cost_category_override_at   TIMESTAMPTZ                         -- [added by 20260313]
);

CREATE INDEX idx_appfolio_transactions_property  ON appfolio_transactions(appfolio_property_id);
CREATE INDEX idx_appfolio_transactions_bill_date ON appfolio_transactions(bill_date);
CREATE INDEX idx_appfolio_transactions_vendor    ON appfolio_transactions(vendor_name);
CREATE INDEX idx_appfolio_transactions_cost_code ON appfolio_transactions(cost_category_code);  -- in schema.sql AND 20260304
-- [added by 20260313] partial index on the override code:
CREATE INDEX appfolio_transactions_category_override_idx
  ON appfolio_transactions (cost_category_code_override)
  WHERE cost_category_code_override IS NOT NULL;
```

The four `cost_category_*_override` columns let an admin/PM manually pin a cost
category; when set, the AppFolio sync preserves these rather than overwriting
from AppFolio.

---

### 1.13 `bridge_mappings`

```sql
CREATE TABLE bridge_mappings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_category_id      UUID NOT NULL REFERENCES cost_categories(id),
  contract_id           UUID REFERENCES contracts(id),
  vendor_name_pattern   TEXT,
  gl_account_id         TEXT,
  match_type            TEXT NOT NULL DEFAULT 'exact'
                          CHECK (match_type IN ('exact', 'contains', 'starts_with')),
  priority              INTEGER NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            TEXT NOT NULL REFERENCES users(id),
  updated_by            TEXT REFERENCES users(id)
);

CREATE INDEX idx_bridge_mappings_project ON bridge_mappings(project_id);
```

---

### 1.14 `transaction_mappings`

```sql
CREATE TABLE transaction_mappings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_transaction_id   UUID NOT NULL UNIQUE REFERENCES appfolio_transactions(id),
  project_id                UUID NOT NULL REFERENCES projects(id),
  gate_id                   UUID NOT NULL REFERENCES gates(id),
  cost_category_id          UUID NOT NULL REFERENCES cost_categories(id),
  contract_id               UUID REFERENCES contracts(id),
  bridge_mapping_id         UUID REFERENCES bridge_mappings(id),
  mapped_amount             NUMERIC(15,2) NOT NULL,
  retainage_held            NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount                NUMERIC(15,2)
                              GENERATED ALWAYS AS (mapped_amount - retainage_held) STORED,
  is_override               BOOLEAN NOT NULL DEFAULT false,
  override_reason           TEXT,
  mapped_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_by                 TEXT REFERENCES users(id)
);

CREATE INDEX idx_transaction_mappings_project  ON transaction_mappings(project_id);
CREATE INDEX idx_transaction_mappings_gate     ON transaction_mappings(gate_id);
CREATE INDEX idx_transaction_mappings_category ON transaction_mappings(cost_category_id);
```

`net_amount` is STORED GENERATED.

---

### 1.15 `retainage_releases`

```sql
CREATE TABLE retainage_releases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id),
  release_date   DATE NOT NULL,
  amount         NUMERIC(15,2) NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT NOT NULL REFERENCES users(id)
);
```

---

### 1.16 `audit_log` (singular — the original, schema.sql)

```sql
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT REFERENCES users(id),
  action       TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name   TEXT NOT NULL,
  record_id    UUID NOT NULL,
  project_id   UUID,
  old_data     JSONB,
  new_data     JSONB,
  ip_address   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_project  ON audit_log(project_id);
CREATE INDEX idx_audit_log_table    ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_occurred ON audit_log(occurred_at DESC);
```

> **IMPORTANT — `audit_log` vs `audit_logs`.** This is the ORIGINAL, generic,
> DB-row-level audit table (action constrained to INSERT/UPDATE/DELETE, stores
> `old_data`/`new_data` JSONB). It is distinct from `audit_logs` (plural, §1.18)
> added later for application-level events. Both exist in the final DB.

---

### 1.17 `gl_balances`

```sql
CREATE TABLE gl_balances (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_property_id   TEXT NOT NULL,
  project_id             UUID REFERENCES projects(id),
  gl_account_id          TEXT NOT NULL,
  gl_account_name        TEXT NOT NULL,
  gl_account_number      TEXT,
  account_type           TEXT NOT NULL,
  balance                NUMERIC(15,2) NOT NULL,
  as_of_date             DATE NOT NULL,
  accounting_basis       TEXT NOT NULL CHECK (accounting_basis IN ('Cash', 'Accrual')),
  sync_id                UUID NOT NULL REFERENCES appfolio_syncs(id),
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(appfolio_property_id, gl_account_id, as_of_date, accounting_basis)
);

CREATE INDEX idx_gl_balances_property_date ON gl_balances(appfolio_property_id, as_of_date);
```

---

### 1.18 `transaction_gate_assignments`

Defined in `schema.sql` (with inline RLS) and re-created idempotently by
`20260308`. Lightweight per-transaction gate assignment, auto-populated during
sync from `bill_date` vs gate date windows, overridable by admin/PM.

```sql
CREATE TABLE transaction_gate_assignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_transaction_id UUID NOT NULL UNIQUE REFERENCES appfolio_transactions(id) ON DELETE CASCADE,
  gate_id                 UUID NOT NULL REFERENCES gates(id),
  is_override             BOOLEAN NOT NULL DEFAULT false,
  assigned_by             TEXT REFERENCES users(id),
  assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tga_gate        ON transaction_gate_assignments(gate_id);
CREATE INDEX idx_tga_transaction ON transaction_gate_assignments(appfolio_transaction_id);
```

RLS for this table is defined INLINE in `schema.sql` — see §3.18.

---

### 1.19 `contract_gates` — junction contract ↔ gate  *(added by 20260305d)*

```sql
CREATE TABLE contract_gates (
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  gate_id     UUID NOT NULL REFERENCES gates(id)     ON DELETE CASCADE,
  PRIMARY KEY (contract_id, gate_id)
);
```

No surrogate id; composite PK. RLS enabled later by `20260311b`.

---

### 1.20 `contract_line_items` — Schedule of Values  *(added by 20260305e)*

```sql
CREATE TABLE contract_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  cost_category_id UUID NOT NULL REFERENCES cost_categories(id),
  description      TEXT,
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cli_contract ON contract_line_items(contract_id);
```

RLS enabled later by `20260311b`.

---

### 1.21 `audit_logs` (plural) — application event log  *(added by 20260305f)*

```sql
CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  user_id     TEXT        NOT NULL,                 -- NOTE: no FK to users
  action      TEXT        NOT NULL,                 -- e.g. 'contract.create', 'gate.delete'
  entity_type TEXT        NOT NULL,                 -- 'contract','gate','change_order','project'
  entity_id   TEXT,
  project_id  TEXT,                                 -- TEXT here (vs UUID in audit_log)
  label       TEXT,
  payload     JSONB
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_user_id_idx    ON audit_logs (user_id);
CREATE INDEX audit_logs_project_id_idx ON audit_logs (project_id);
CREATE INDEX audit_logs_action_idx     ON audit_logs (action);
```

RLS enabled later by `20260311b` (admin/accounting SELECT only; inserts via
service role).

---

### 1.22 `transaction_notes`  *(added by 20260306b)*

```sql
CREATE TABLE transaction_notes (
  appfolio_bill_id TEXT PRIMARY KEY
                     REFERENCES appfolio_transactions(appfolio_bill_id) ON DELETE CASCADE,
  note             TEXT NOT NULL DEFAULT '',
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Keyed on `appfolio_bill_id` (the natural key) so notes survive re-syncs. RLS
defined in `20260306b` then **replaced** by `20260311c` (see §2 / §3).

---

### 1.23 `project_vendors`  *(added by 20260309)*

```sql
CREATE TABLE project_vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT REFERENCES users(id),
  UNIQUE(project_id, name)
);

CREATE INDEX idx_project_vendors_project ON project_vendors(project_id);
CREATE INDEX idx_project_vendors_name    ON project_vendors(project_id, name);
```

RLS in §3.23. The migration also backfills vendor names from `contracts` and
`appfolio_transactions` (see §2.14).

---

### 1.24 `vendor_documents`  *(added by 20260310)*

```sql
CREATE TABLE vendor_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name             TEXT NOT NULL,                         -- matched by name, global
  project_id              UUID REFERENCES projects(id) ON DELETE SET NULL,  -- NULL = all projects
  document_type           TEXT NOT NULL
                            CHECK (document_type IN ('COI', 'Lien Waiver', 'W-9', 'Other')),
  display_name            TEXT NOT NULL,
  storage_path            TEXT NOT NULL,                         -- under 'project-documents' bucket, vendors/ prefix
  insurer_name            TEXT,
  policy_number           TEXT,
  coverage_type           TEXT,
  per_occurrence_limit    NUMERIC,                               -- unscaled NUMERIC
  aggregate_limit         NUMERIC,
  additional_insured      BOOLEAN,
  waiver_of_subrogation   BOOLEAN,
  waiver_type             TEXT
                            CHECK (waiver_type IS NULL OR waiver_type IN (
                              'Conditional Partial', 'Conditional Final',
                              'Unconditional Partial', 'Unconditional Final')),
  waiver_amount           NUMERIC,
  through_date            DATE,
  effective_date          DATE,
  expiration_date         DATE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_vendor_documents_vendor_name ON vendor_documents (vendor_name);
CREATE INDEX idx_vendor_documents_expiration  ON vendor_documents (expiration_date)
  WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_vendor_documents_project     ON vendor_documents (project_id)
  WHERE project_id IS NOT NULL;
```

RLS in §3.24.

---

### 1.25 `pending_project_assignments`  *(added by 20260310d)*

```sql
CREATE TABLE pending_project_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_email TEXT        NOT NULL,
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_by  TEXT        NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
  UNIQUE(invite_email, project_id)
);

CREATE INDEX pending_project_assignments_email_idx
  ON pending_project_assignments(invite_email);
```

Holds project assignments for invited users who have not yet signed up; consumed
(applied to `project_users`, then deleted) at sign-up. RLS enabled by `20260311b`
(admin only).

---

### 1.26 `draw_requests`  *(added by 20260310g)*

```sql
CREATE TABLE draw_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draw_number     INTEGER NOT NULL,
  title           TEXT,
  submission_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  lender          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL REFERENCES users(id),
  UNIQUE(project_id, draw_number)
);

CREATE INDEX idx_draw_requests_project ON draw_requests(project_id);
```

RLS in §3.26.

---

### 1.27 `draw_request_lines`  *(added by 20260310g)*

```sql
CREATE TABLE draw_request_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_request_id   UUID NOT NULL REFERENCES draw_requests(id) ON DELETE CASCADE,
  cost_category_id  UUID NOT NULL REFERENCES cost_categories(id),
  this_draw_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_request_id, cost_category_id)
);

CREATE INDEX idx_draw_request_lines_draw ON draw_request_lines(draw_request_id);
```

RLS in §3.27.

---

### 1.28 `chat_logs`, `user_activity_logs`, `ai_usage_logs`  *(added by 20260312)*

```sql
CREATE TABLE chat_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT,
  messages    JSONB NOT NULL,
  response    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_logs_user_id_idx    ON chat_logs (user_id);
CREATE INDEX chat_logs_created_at_idx ON chat_logs (created_at DESC);

CREATE TABLE user_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  path        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_activity_logs_user_id_idx    ON user_activity_logs (user_id);
CREATE INDEX user_activity_logs_created_at_idx ON user_activity_logs (created_at DESC);

CREATE TABLE ai_usage_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_logs_user_id_idx    ON ai_usage_logs (user_id);
CREATE INDEX ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);
```

RLS in §3.28.

---

# 2. Migration-by-Migration Changelog

Apply in this exact filename order.

**2.1 `20260304_add_cost_category_to_transactions.sql`**
- `ALTER TABLE appfolio_transactions ADD COLUMN IF NOT EXISTS cost_category_code TEXT, cost_category_name TEXT`.
- `ALTER COLUMN gl_account_id SET DEFAULT ''` and `gl_account_name SET DEFAULT ''`.
- `CREATE INDEX IF NOT EXISTS idx_appfolio_transactions_cost_code ON appfolio_transactions(cost_category_code)`.

**2.2 `20260304b_clear_stale_cost_category_names.sql`** — Data backfill only.
`UPDATE appfolio_transactions SET cost_category_name = NULL WHERE cost_category_code IS NULL AND cost_category_name IS NOT NULL`.

**2.3 `20260305_add_project_image_url.sql`**
`ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT`. (Idempotent; column also in schema.sql.)

**2.4 `20260305b_cleanup_null_billdate_transactions.sql`** — Data cleanup.
`DELETE FROM appfolio_transactions WHERE bill_date IS NULL;` then
`DELETE FROM appfolio_transactions WHERE bill_date = CURRENT_DATE AND cost_category_code IS NULL;`.

**2.5 `20260305c_image_url_cache_reload.sql`**
Re-runs `ADD COLUMN IF NOT EXISTS image_url TEXT` (idempotent) then `NOTIFY pgrst, 'reload schema';` (PostgREST schema-cache reload).

**2.6 `20260305d_contract_gates.sql`**
- Creates `contract_gates` junction (composite PK, both FKs ON DELETE CASCADE).
- Backfills: `INSERT INTO contract_gates SELECT id, gate_id FROM contracts WHERE gate_id IS NOT NULL ON CONFLICT DO NOTHING`.
- `ALTER TABLE contracts ALTER COLUMN gate_id DROP NOT NULL`.
- `NOTIFY pgrst, 'reload schema';`.

**2.7 `20260305e_contract_line_items.sql`**
Creates `contract_line_items` + `idx_cli_contract`; `NOTIFY pgrst, 'reload schema';`.

**2.8 `20260305f_audit_logs.sql`**
Creates plural `audit_logs` table + 4 indexes (created_at desc, user_id, project_id, action). No RLS here (added in 20260311b).

**2.9 `20260306_change_order_enhancements.sql`**
`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`.

**2.10 `20260306b_transaction_notes.sql`**
- Creates `transaction_notes` (PK = `appfolio_bill_id`).
- `ENABLE ROW LEVEL SECURITY`.
- Creates policy `"admins_all_transaction_notes"` FOR ALL USING `EXISTS(... role IN ('admin','pm','read_only'))`. **NOTE: buggy** — uses non-existent role `'pm'`, grants write to `read_only`, omits `accounting`; replaced by 20260311c.

**2.11 `20260306c_reload_schema_cache.sql`** — `NOTIFY pgrst, 'reload schema';` only (picks up transaction_notes).

**2.12 `20260308_transaction_gate_assignments.sql`**
Idempotently re-creates `transaction_gate_assignments` (already in schema.sql), its 2 indexes, enables RLS, and re-creates its 4 inline policies (see §3.18). All `CREATE ... IF NOT EXISTS` / `CREATE POLICY` — replaying schema.sql first then this will error on duplicate policy names unless schema.sql wasn't applied; in a fresh build apply schema.sql which already includes these. (See Gotchas.)

**2.13 `20260308b_reload_schema_cache_tga.sql`** — `NOTIFY pgrst, 'reload schema';` only.

**2.14 `20260309_project_vendors.sql`**
- Creates `project_vendors` + 2 indexes.
- Enables RLS; creates 4 policies (admin all, all-auth read, PM insert, PM update) — see §3.23.
- Backfills vendor names from `contracts` and from `appfolio_transactions` joined to `projects` on `appfolio_property_id` (`ON CONFLICT (project_id, name) DO NOTHING`).
- `NOTIFY pgrst, 'reload schema';`.

**2.15 `20260309b_project_documents_storage.sql`**
- `INSERT INTO storage.buckets` creating private bucket `project-documents` (50 MB limit; allowed MIME types: PDF, msword, docx, xls, xlsx, ppt, pptx, jpeg, png, gif, webp, text/plain, text/csv, zip, x-zip-compressed) `ON CONFLICT (id) DO NOTHING`.
- Storage object policies on `storage.objects` (DROP IF EXISTS then CREATE): authenticated INSERT/SELECT/DELETE where `bucket_id = 'project-documents'`.
- Idempotent `CREATE TABLE IF NOT EXISTS project_documents (...)`.
- `NOTIFY pgrst, 'reload schema';`.

**2.16 `20260310_vendor_documents.sql`**
Creates `vendor_documents` + 3 indexes (one plain, two partial). Enables RLS; 4 policies: all-auth SELECT, PM+admin INSERT, PM+admin UPDATE, admin-only DELETE (using `auth.uid()::text`). `NOTIFY pgrst, 'reload schema';`.

**2.17 `20260310b_project_pm.sql`**
`ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_user_id TEXT REFERENCES users(id)`. `NOTIFY pgrst, 'reload schema';`.

**2.18 `20260310c_user_last_login.sql`**
`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`.

**2.19 `20260310d_pending_project_assignments.sql`**
Creates `pending_project_assignments` + `pending_project_assignments_email_idx`. No RLS yet (added 20260311b).

**2.20 `20260310e_accounting_role.sql`**
`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;` then re-add `users_role_check CHECK (role IN ('admin','project_manager','read_only','accounting'))`.

**2.21 `20260310f_add_mhp_property_type.sql`**
`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_property_type_check;` then re-add `projects_property_type_check CHECK (property_type IN ('Multifamily','MHP','Commercial','Mixed-Use','Land','Other'))`. (Note: 'MHP' is already present in schema.sql's inline definition; this normalizes the named constraint.)

**2.22 `20260310g_draw_requests.sql`**
- `ALTER TABLE projects ADD COLUMN IF NOT EXISTS lender TEXT`.
- Creates `draw_requests` and `draw_request_lines` + 2 indexes.
- Enables RLS on both; creates policies (admin+accounting ALL; PM select/insert/update/delete; read_only select) — see §3.26 / §3.27.

**2.23 `20260311_pending_pm_email.sql`**
`ALTER TABLE projects ADD COLUMN IF NOT EXISTS pending_pm_email TEXT`.

**2.24 `20260311b_security_advisor_fixes.sql`**
- Recreates `get_my_role()`, `is_admin()`, `is_assigned_to_project(uuid)` with `SET search_path = ''` and schema-qualified `public.users` / `public.project_users` (hardening).
- Enables RLS + adds policies on previously-unprotected tables: `pending_project_assignments` (admin all), `contract_gates` (admin/accounting all; PM all on assigned; read_only select), `contract_line_items` (same pattern), `audit_logs` (admin/accounting SELECT only).

**2.25 `20260311c_fix_transaction_notes_policy.sql`**
- `DROP POLICY IF EXISTS "admins_all_transaction_notes" ON transaction_notes` (the buggy one).
- Creates `"admin_accounting_pm_all_transaction_notes"` FOR ALL (roles admin/accounting/project_manager) and `"ro_select_transaction_notes"` FOR SELECT (read_only). Uses `auth.uid()::TEXT` and `public.users`.

**2.26 `20260312_development_lead_and_logging.sql`**
- `users_role_check` dropped/re-added to add `development_lead`: final `CHECK (role IN ('admin','project_manager','read_only','accounting','development_lead'))`.
- Creates `chat_logs`, `user_activity_logs`, `ai_usage_logs` + indexes.
- Enables RLS on all three; for each: admin SELECT (`get_my_role()='admin'`) and INSERT `WITH CHECK (true)`.

**2.27 `20260313_cost_category_override.sql`**
- `ALTER TABLE appfolio_transactions ADD COLUMN IF NOT EXISTS cost_category_code_override TEXT, cost_category_name_override TEXT, cost_category_override_by TEXT REFERENCES users(id) ON DELETE SET NULL, cost_category_override_at TIMESTAMPTZ`.
- Partial index `appfolio_transactions_category_override_idx ON (cost_category_code_override) WHERE cost_category_code_override IS NOT NULL`.

---

# 3. Row Level Security

## Access model

Roles (in `users.role`): `admin`, `project_manager`, `read_only`, `accounting`,
`development_lead`.

- **admin** — full access to everything (via `is_admin()`).
- **accounting** — admin-equivalent on financial tables added later
  (`contract_gates`, `contract_line_items`, `audit_logs`, `draw_requests`,
  `draw_request_lines`, `transaction_notes`). Note: the *original* schema.sql/
  rls.sql tables only grant accounting via the broad admin policies where the
  later migrations explicitly added `get_my_role() IN ('admin','accounting')`.
- **development_lead** — only added to the role CHECK in `20260312`; **no
  dedicated RLS policies** reference it, so it behaves like an unprivileged
  authenticated user (no row visibility beyond self) unless app logic grants
  more. (The handoff prompt describes development_lead as "all access" — that is
  the *intended app-layer* behavior; at the DB/RLS layer it currently has no
  granting policies.)
- **project_manager** — scoped to projects it is assigned to via `project_users`
  (`is_assigned_to_project()`); read + write on project-scoped tables.
- **read_only** — scoped read of assigned projects only; never writes.

All policies are `TO authenticated`. Clerk identity arrives as `auth.jwt() ->> 'sub'`
(equivalently `auth.uid()::text` in the few policies that use it).

## Helper functions (from `rls.sql`, hardened by `20260311b`)

Final definitions (post-`20260311b`):

```sql
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT role FROM public.users WHERE id = (auth.jwt() ->> 'sub'); $$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.users
       WHERE id = (auth.jwt() ->> 'sub') AND role = 'admin'); $$;

CREATE OR REPLACE FUNCTION is_assigned_to_project(proj_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.project_users
       WHERE project_id = proj_id AND user_id = (auth.jwt() ->> 'sub')); $$;
```

`SECURITY DEFINER` lets them read `users`/`project_users` even when RLS is on
those tables. The original `rls.sql` versions lacked `SET search_path = ''` and
used unqualified table names — `20260311b` fixed this to prevent schema-shadow
attacks. They read the Clerk user ID from the JWT `sub` claim.

`rls.sql` enables RLS on these 17 tables: users, projects, cost_categories,
project_documents, project_users, gates, budget_imports, gate_budgets, contracts,
change_orders, appfolio_syncs, appfolio_transactions, bridge_mappings,
transaction_mappings, retainage_releases, audit_log, gl_balances.
(`transaction_gate_assignments` RLS is enabled inline in schema.sql; the
migration tables enable their own RLS.)

### Policies per table

**3.1 `users`**
- `admin_all_users` — FOR ALL: USING `is_admin()`, WITH CHECK `is_admin()`.
- `self_read_users` — FOR SELECT: USING `id = (auth.jwt()->>'sub')`.

**3.2 `projects`**
- `admin_all_projects` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_assigned_projects` — FOR SELECT: `get_my_role()='project_manager' AND is_assigned_to_project(id)`.
- `pm_update_assigned_projects` — FOR UPDATE: same USING expr.
- `ro_select_assigned_projects` — FOR SELECT: `get_my_role()='read_only' AND is_assigned_to_project(id)`.

**3.3 `cost_categories`**
- `admin_all_cost_categories` — FOR ALL: `is_admin()` / `is_admin()`.
- `authenticated_read_cost_categories` — FOR SELECT: USING `true`.

**3.4 `project_documents`**
- `admin_all_project_documents` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_all_assigned_project_documents` — FOR ALL: USING & WITH CHECK `get_my_role()='project_manager' AND is_assigned_to_project(project_id)`.
- `ro_select_assigned_project_documents` — FOR SELECT: `get_my_role()='read_only' AND is_assigned_to_project(project_id)`.

**3.5 `project_users`**
- `admin_all_project_users` — FOR ALL: `is_admin()` / `is_admin()`.
- `self_read_project_users` — FOR SELECT: USING `user_id = (auth.jwt()->>'sub')`.

**3.6 `gates`**
- `admin_all_gates` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_assigned_gates` — FOR SELECT: `get_my_role()='project_manager' AND is_assigned_to_project(project_id)`.
- `ro_select_assigned_gates` — FOR SELECT: `get_my_role()='read_only' AND is_assigned_to_project(project_id)`.

**3.7 `budget_imports`**
- `admin_all_budget_imports` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_insert_budget_imports` — FOR INSERT: WITH CHECK `get_my_role()='project_manager' AND is_assigned_to_project(project_id)`.
- `pm_select_assigned_budget_imports` — FOR SELECT: same USING.
- `ro_select_assigned_budget_imports` — FOR SELECT: read_only variant.

**3.8 `gate_budgets`** (scoped via join to gates → project)
- `admin_all_gate_budgets` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_write_assigned_gate_budgets` — FOR INSERT: WITH CHECK `get_my_role()='project_manager' AND EXISTS (SELECT 1 FROM gates g WHERE g.id = gate_id AND is_assigned_to_project(g.project_id))`.
- `pm_select_assigned_gate_budgets` — FOR SELECT: same EXISTS pattern.
- `ro_select_assigned_gate_budgets` — FOR SELECT: read_only variant.

**3.9 `contracts`**
- `admin_all_contracts` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_write_assigned_contracts` — FOR INSERT: WITH CHECK PM + assigned.
- `pm_update_assigned_contracts` — FOR UPDATE: USING PM + assigned.
- `pm_select_assigned_contracts` — FOR SELECT: USING PM + assigned.
- `ro_select_assigned_contracts` — FOR SELECT: read_only + assigned.

**3.10 `change_orders`** — same five-policy pattern as contracts:
`admin_all_change_orders`, `pm_write_assigned_change_orders` (INSERT),
`pm_update_assigned_change_orders` (UPDATE), `pm_select_assigned_change_orders`
(SELECT), `ro_select_assigned_change_orders` (SELECT). PM/RO scoped by
`is_assigned_to_project(project_id)`.

**3.11 `appfolio_syncs`**
- `admin_all_appfolio_syncs` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_appfolio_syncs` — FOR SELECT: USING `get_my_role()='project_manager'` (no project scoping — PMs see all sync runs).

**3.12 `appfolio_transactions`** (scoped via property→project)
- `admin_all_appfolio_transactions` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_assigned_appfolio_transactions` — FOR SELECT: `get_my_role()='project_manager' AND EXISTS (SELECT 1 FROM projects p WHERE p.appfolio_property_id = appfolio_transactions.appfolio_property_id AND is_assigned_to_project(p.id))`.
- `ro_select_assigned_appfolio_transactions` — FOR SELECT: read_only variant.

**3.13 `bridge_mappings`** — admin only:
- `admin_all_bridge_mappings` — FOR ALL: `is_admin()` / `is_admin()`.

**3.14 `transaction_mappings`**
- `admin_all_transaction_mappings` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_assigned_transaction_mappings` — FOR SELECT: PM + `is_assigned_to_project(project_id)`.
- `ro_select_assigned_transaction_mappings` — FOR SELECT: read_only + assigned.

**3.15 `retainage_releases`**
- `admin_all_retainage_releases` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_write_assigned_retainage_releases` — FOR INSERT: WITH CHECK PM + assigned.
- `pm_select_assigned_retainage_releases` — FOR SELECT: PM + assigned.
- `ro_select_assigned_retainage_releases` — FOR SELECT: read_only + assigned.

**3.16 `audit_log`** (immutable — no INSERT/UPDATE/DELETE policy for users)
- `admin_select_audit_log` — FOR SELECT: USING `is_admin()`.
- Inserts come only from service role (`createAdminClient`) which bypasses RLS.

**3.17 `gl_balances`**
- `admin_all_gl_balances` — FOR ALL: `is_admin()` / `is_admin()`.
- `pm_select_assigned_gl_balances` — FOR SELECT: `get_my_role()='project_manager' AND (project_id IS NULL OR is_assigned_to_project(project_id))`.
- `ro_select_assigned_gl_balances` — FOR SELECT: read_only variant (NULL project_id visible to all scoped roles).

**3.18 `transaction_gate_assignments`** — RLS + policies are INLINE in `schema.sql` (and re-run by `20260308`):
- `"Admins full access on tga"` — FOR ALL: USING `is_admin()`, WITH CHECK `is_admin()`.
- `"PMs and read-only can read tga"` — FOR SELECT: USING `true` (any authenticated user can read).
- `"PMs can insert/update tga"` — FOR INSERT: WITH CHECK `EXISTS (SELECT 1 FROM users u WHERE u.id = auth.jwt() ->> 'sub' AND u.role IN ('admin','project_manager'))`.
- `"PMs can update tga"` — FOR UPDATE: USING the same EXISTS expression.

**3.19 `contract_gates`** (added by `20260311b`)
- `admin_accounting_all_contract_gates` — FOR ALL: `get_my_role() IN ('admin','accounting')` (USING & WITH CHECK).
- `pm_all_assigned_contract_gates` — FOR ALL: PM AND `EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND is_assigned_to_project(c.project_id))` (USING & WITH CHECK).
- `ro_select_assigned_contract_gates` — FOR SELECT: read_only + same EXISTS.

**3.20 `contract_line_items`** (added by `20260311b`) — same three-policy pattern as contract_gates, keyed on `contract_id`:
`admin_accounting_all_contract_line_items`, `pm_all_assigned_contract_line_items`, `ro_select_assigned_contract_line_items`.

**3.21 `audit_logs`** (plural, added by `20260311b`)
- `admin_accounting_select_audit_logs` — FOR SELECT: `get_my_role() IN ('admin','accounting')`. No INSERT policy (service-role inserts).

**3.22 `transaction_notes`** (final state after `20260311c`; original buggy policy dropped)
- `admin_accounting_pm_all_transaction_notes` — FOR ALL: USING & WITH CHECK `EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()::TEXT AND role IN ('admin','accounting','project_manager'))`.
- `ro_select_transaction_notes` — FOR SELECT: `EXISTS (... role = 'read_only')`.

**3.23 `project_vendors`** (added by `20260309`)
- `"Admins full access on project_vendors"` — FOR ALL: `EXISTS (... role='admin')` (USING & WITH CHECK).
- `"Authenticated users can read project_vendors"` — FOR SELECT: USING `true`.
- `"PMs can insert project_vendors"` — FOR INSERT: WITH CHECK `EXISTS (... role IN ('admin','project_manager'))`.
- `"PMs can update project_vendors"` — FOR UPDATE: USING `EXISTS (... role IN ('admin','project_manager'))`.

**3.24 `vendor_documents`** (added by `20260310`; uses `auth.uid()::text`)
- `"Auth users can read vendor documents"` — FOR SELECT: USING `true`.
- `"PMs and admins can insert vendor documents"` — FOR INSERT: WITH CHECK role IN ('admin','project_manager').
- `"PMs and admins can update vendor documents"` — FOR UPDATE: USING role IN ('admin','project_manager').
- `"Admins can delete vendor documents"` — FOR DELETE: USING role='admin'.

**3.25 `pending_project_assignments`** (added by `20260311b`)
- `admin_all_pending_project_assignments` — FOR ALL: `is_admin()` / `is_admin()`.

**3.26 `draw_requests`** (added by `20260310g`)
- `admin_accounting_all_draw_requests` — FOR ALL: `get_my_role() IN ('admin','accounting')`.
- `pm_select_draw_requests` — FOR SELECT: PM + assigned.
- `pm_insert_draw_requests` — FOR INSERT: WITH CHECK PM + assigned.
- `pm_update_draw_requests` — FOR UPDATE: USING PM + assigned.
- `pm_delete_draw_requests` — FOR DELETE: USING PM + assigned.
- `ro_select_draw_requests` — FOR SELECT: read_only + assigned.

**3.27 `draw_request_lines`** (added by `20260310g`; scoped via join to draw_requests → project)
- `admin_accounting_all_draw_lines` — FOR ALL: `get_my_role() IN ('admin','accounting')`.
- `pm_select_draw_lines` / `pm_insert_draw_lines` / `pm_update_draw_lines` / `pm_delete_draw_lines` — PM AND `EXISTS (SELECT 1 FROM draw_requests dr WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id))`.
- `ro_select_draw_lines` — FOR SELECT: read_only + same EXISTS.

**3.28 `chat_logs` / `user_activity_logs` / `ai_usage_logs`** (added by `20260312`)
For each table:
- `"Admins can read <table>"` — FOR SELECT: USING `get_my_role() = 'admin'`.
- `"Admins can insert <table>"` — FOR INSERT: WITH CHECK `true` (inserts allowed from any authenticated context / service role).

**Storage object policies** (added by `20260309b`, on `storage.objects`):
- `"Auth users can upload project documents"` — INSERT WITH CHECK `bucket_id='project-documents'`.
- `"Auth users can read project documents"` — SELECT USING `bucket_id='project-documents'`.
- `"Auth users can delete project documents"` — DELETE USING `bucket_id='project-documents'`.

---

# 4. Triggers / Functions

- **No SQL triggers** (`CREATE TRIGGER`) are defined anywhere in schema.sql,
  rls.sql, or any migration. There are no `BEFORE`/`AFTER` row triggers and no
  trigger-based audit mechanism.
- **Functions** — only the three RLS helper functions: `get_my_role()`,
  `is_admin()`, `is_assigned_to_project(uuid)` (all `LANGUAGE sql STABLE SECURITY
  DEFINER SET search_path=''`, defined in rls.sql, hardened in `20260311b`). See
  §3.
- **Auditing is application-level, not trigger-level.** Two audit tables exist
  (`audit_log` row-data style, `audit_logs` event style); both are written by
  server-side code via the Supabase service-role client (`createAdminClient`),
  which bypasses RLS. There is no DB function/trigger that auto-populates them.
- The three `STORED GENERATED` columns (`gate_budgets.revised_budget`,
  `contracts.revised_value`, `transaction_mappings.net_amount`) are computed by
  Postgres' generated-column machinery, not by functions/triggers.

---

# 5. Setup Order (from scratch)

Run in the Supabase SQL Editor / via migration tooling, in this exact sequence:

1. **`supabase/schema.sql`** — extensions + 18 tables + their indexes + inline
   RLS on `transaction_gate_assignments`. (`CREATE EXTENSION pgcrypto` first.)
2. **`supabase/rls.sql`** — helper functions + `ENABLE ROW LEVEL SECURITY` on
   the 17 core tables + all base policies.
3. **Migrations in filename order** (date order; the `b/c/d…` suffixes order
   same-day files):
   1. 20260304_add_cost_category_to_transactions
   2. 20260304b_clear_stale_cost_category_names
   3. 20260305_add_project_image_url
   4. 20260305b_cleanup_null_billdate_transactions
   5. 20260305c_image_url_cache_reload
   6. 20260305d_contract_gates
   7. 20260305e_contract_line_items
   8. 20260305f_audit_logs
   9. 20260306_change_order_enhancements
   10. 20260306b_transaction_notes
   11. 20260306c_reload_schema_cache
   12. 20260308_transaction_gate_assignments
   13. 20260308b_reload_schema_cache_tga
   14. 20260309_project_vendors
   15. 20260309b_project_documents_storage
   16. 20260310_vendor_documents
   17. 20260310b_project_pm
   18. 20260310c_user_last_login
   19. 20260310d_pending_project_assignments
   20. 20260310e_accounting_role
   21. 20260310f_add_mhp_property_type
   22. 20260310g_draw_requests
   23. 20260311_pending_pm_email
   24. 20260311b_security_advisor_fixes
   25. 20260311c_fix_transaction_notes_policy
   26. 20260312_development_lead_and_logging
   27. 20260313_cost_category_override
4. **Clerk JWT template** (see below) — required for any authenticated query to
   pass RLS, since policies read `auth.jwt() ->> 'sub'`.
5. **Clerk webhook** → `POST /api/webhooks/clerk` (events `user.created`,
   `user.updated`, `user.deleted`) syncs Clerk users into `public.users`. Store
   `CLERK_WEBHOOK_SECRET=whsec_...`.
6. Assign the first **admin** by setting Clerk Public Metadata `{"role":"admin"}`
   on your user (fires `user.updated` → writes `role='admin'`). Until then a user
   defaults to `read_only`.

## Clerk JWT template (summary of `clerk-jwt-setup.md`)

- **Template name**: `supabase` (must be exactly this — app calls
  `getToken({ template: 'supabase' })`).
- **Signing algorithm**: `HS256`.
- **Signing key**: the Supabase project's JWT Secret (Dashboard → Settings → API
  → JWT Settings → JWT Secret).
- **Claims JSON**:
  ```json
  {
    "sub": "{{user.id}}",
    "role": "authenticated",
    "iss": "https://clerk.dev",
    "iat": "{{date.now}}",
    "exp": "{{date.now_plus_5_minutes}}"
  }
  ```
- Flow: sign in → app gets JWT signed with the Supabase secret → sent as
  `Authorization: Bearer <token>` on Supabase requests → Supabase verifies and
  exposes `sub` (the Clerk user ID) to RLS via `auth.jwt()->>'sub'` /
  `auth.uid()`. The `role: authenticated` claim is why every policy targets
  `TO authenticated`.

---

# 6. Gotchas

1. **STORED GENERATED columns — never insert/update them.** Inserting a value
   into any of these raises an error:
   - `gate_budgets.revised_budget = original_budget + approved_co_amount`
   - `contracts.revised_value = original_value + approved_co_amount`
   - `transaction_mappings.net_amount = mapped_amount - retainage_held`

2. **`audit_log` (singular) vs `audit_logs` (plural)** — two separate tables.
   - `audit_log`: original, generic row-change log; `action` CHECK
     INSERT/UPDATE/DELETE; `record_id UUID`, `project_id UUID`, `old_data`/
     `new_data` JSONB. SELECT-only RLS for admins.
   - `audit_logs`: app-event log added in `20260305f`; free-text `action`
     (e.g. `'contract.create'`), `entity_type`, `entity_id TEXT`,
     `project_id TEXT` (TEXT, not UUID), `label`, `payload`. `user_id` has **no
     FK**. Admin/accounting SELECT-only RLS (added in `20260311b`).
   - Both are write-only via service role; neither has a user-facing INSERT
     policy.

3. **"One active gate per project"** is enforced by a *partial unique index*,
   not a constraint: `CREATE UNIQUE INDEX one_active_gate_per_project ON
   gates(project_id) WHERE status = 'active';`. You can have many `pending`/
   `closed` gates per project but at most one `active`.

4. **Schema-cache reload migrations** are `NOTIFY pgrst, 'reload schema';` no-ops
   that exist only so PostgREST/Supabase immediately sees new columns/tables:
   `20260305c`, `20260306c`, `20260308b` (and inline `NOTIFY` at the end of
   `20260305d/e`, `20260309`, `20260309b`, `20260310`, `20260310b`). Safe to run
   anytime; they make no DDL changes (except `20260305c` re-adds `image_url`
   idempotently).

5. **`cost_category_*_override` columns** on `appfolio_transactions` (added by
   `20260313`): `cost_category_code_override`, `cost_category_name_override`,
   `cost_category_override_by` (FK users, ON DELETE SET NULL),
   `cost_category_override_at`. When set, the AppFolio sync must **preserve**
   them instead of overwriting from the source. Partial index only covers rows
   where `cost_category_code_override IS NOT NULL`.

6. **`transaction_notes` is keyed on the natural key** `appfolio_bill_id`
   (TEXT PK, FK to `appfolio_transactions.appfolio_bill_id` ON DELETE CASCADE),
   not the UUID — so notes survive transaction re-syncs.

7. **Buggy original `transaction_notes` policy** (`20260306b`) referenced role
   `'pm'` (which doesn't exist — correct value is `project_manager`), granted
   write to `read_only`, and omitted `accounting`. It is dropped and replaced in
   `20260311c`. If replaying, the final state has only the two `20260311c`
   policies.

8. **`transaction_gate_assignments` RLS is inline in `schema.sql`**, and
   `20260308` re-creates the same table + policies with `IF NOT EXISTS` /
   `CREATE POLICY`. In a clean build where schema.sql already created the table
   and its policies, re-running `20260308`'s `CREATE POLICY` statements will
   **fail on duplicate policy names** (CREATE POLICY has no `IF NOT EXISTS`).
   Treat `20260308` as historical/idempotent-for-table-only; the policies
   already exist from schema.sql. (The migration was authored for environments
   provisioned before this table was folded into schema.sql.)

9. **`development_lead` role has no granting RLS policies.** It was only added to
   the `users.role` CHECK (`20260312`). At the DB layer it gets only the
   universal "read your own user / read cost_categories / read true-USING tables"
   visibility. Broad "development_lead = all access" is enforced at the
   application layer, not in RLS. Plan accordingly if relying on RLS alone.

10. **`contracts.gate_id` is nullable** in the final schema (NOT NULL dropped by
    `20260305d`). Multi-gate contracts use the `contract_gates` junction; the
    single `gate_id` is just a default/fallback gate for new change orders.

11. **`accounting` role coverage is uneven.** It is explicitly granted on tables
    added by later migrations (`contract_gates`, `contract_line_items`,
    `audit_logs`, `draw_requests`, `draw_request_lines`, `transaction_notes`) via
    `get_my_role() IN ('admin','accounting')`, but on the *original* schema.sql/
    rls.sql tables the only "full access" policies use `is_admin()` — accounting
    is **not** granted there at the RLS layer. (App layer compensates.)

12. **Mixed JWT accessors.** Most policies use `auth.jwt() ->> 'sub'`; a few
    (`vendor_documents`, `transaction_notes`) use `auth.uid()::text`. Both
    resolve to the Clerk user ID given the JWT template above — keep both working.

13. **Storage bucket `project-documents`** (private, 50 MB, specific MIME
    allow-list) is required for project + vendor document uploads; vendor docs
    live under a `vendors/` path prefix in the same bucket. Most access goes
    through the service role; the three storage.objects policies are
    defence-in-depth.

14. **`appfolio_syncs`, `budget_imports` ordering** — `appfolio_syncs` must be
    created before `appfolio_transactions`/`gl_balances` (FK `sync_id`), and
    `budget_imports` before `gate_budgets` (FK `import_batch_id`). schema.sql
    already orders these correctly; preserve the order if hand-recreating.


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/02-reports.md -->
<!-- ============================================================ -->

# KILN Reports Subsystem — Rebuild Specification

This document is a complete, repo-free rebuild spec for the REPORTS subsystem of KILN, a Next.js 14 App Router / RSC real-estate development financial app. Every report under `app/(dashboard)/reports/` is documented with its route, query params, data sources, full calculation logic, filters/persistence, and export/print behaviour.

---

## 0. Conventions shared across all reports

### 0.1 Page setup
- Every report `page.tsx` is a **React Server Component** with `export const dynamic = "force-dynamic";` at the top (no static caching).
- Data access is via `createAdminClient()` from `@/lib/supabase/server` — a Supabase **service-role** client (bypasses RLS). There is no raw `pg`/`DATABASE_URL` SQL anywhere in the reports subsystem; **all** queries use the Supabase JS query builder.
- The authenticated user id comes from a request header: `const userId = (await headers()).get("x-clerk-user-id");` (Clerk auth, injected by middleware).
- Access scoping: `const allowedProjectIds = await getAccessibleProjectIds(supabase, userId)` from `@/lib/access`. Returns `string[]` of accessible project ids, or `null` meaning "admin / unrestricted — all projects". Pattern used everywhere:
  ```ts
  let projectsQuery = supabase.from("projects").select("id, name, code, appfolio_property_id, status").order("name");
  if (allowedProjectIds !== null) {
    projectsQuery = projectsQuery.in("id", allowedProjectIds.length > 0 ? allowedProjectIds : [""]);
  }
  ```
  (The `[""]` sentinel guarantees an empty result instead of an unfiltered query when the user has zero accessible projects.)
- URL `projectIds` are always re-constrained to the loaded (accessible) set: `authorizedProjectIds = projectIds.filter(id => projects.some(p => p.id === id))`.
- Header: `<Header title="…" helpContent={HELP.xxx} />` from `@/components/layout/header`, help text strings live in `@/lib/help` (`HELP.pcmReport`, `HELP.costDetail`, `HELP.vendorDetail`, `HELP.commitmentDetail`, `HELP.changeOrderLog`, `HELP.balanceSheet`, `HELP.trialBalance`, `HELP.gateDetailReport`, `HELP.reports`).

### 0.2 Date helpers (repeated verbatim in most pages)
```ts
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function today(): string { return localDateStr(new Date()); }

// AppFolio intraday txns (occurred_on = today) lack project_cost_category.
// Cap bill_date at YESTERDAY so stale/pending records never appear.
function appfolioDateCap(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d);
}
```
All AppFolio-transaction reads cap the date with: `const txDateCap = asOf < appfolioDateCap() ? asOf : appfolioDateCap();` — i.e. the effective ceiling is `min(asOf, yesterday)`.

### 0.3 Cost-category matching rule (PCM-canonical)
AppFolio's `vendor_ledger` sync stores `appfolio_transactions.cost_category_code` as either the bare numeric prefix (`"010700"`) or the full label (`"010700 Survey"`). To match transactions to `cost_categories.code` (which may also be stored either way), reports build a case-insensitive lookup indexed by BOTH the full code and the leading numeric prefix (text before the first space):
```ts
const codeToCategory = new Map<string, string>(); // upper-cased -> category id
for (const cat of categories) {
  const full = cat.code.trim().toUpperCase();
  codeToCategory.set(full, cat.id);
  const spaceIdx = full.indexOf(" ");
  if (spaceIdx > 0) {
    const prefix = full.slice(0, spaceIdx);
    if (!codeToCategory.has(prefix)) codeToCategory.set(prefix, cat.id);
  }
}
// match: const catId = code ? (codeToCategory.get(code.trim().toUpperCase()) ?? null) : null;
```

### 0.4 Currency / number formatters
- PCM & commitment: `usd(n)` → `Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0})`; returns `"—"` when `n === 0`.
- Detail tables (cost/vendor/gate): `usd(n)` with **2** fraction digits, never dashes zero.
- Trial balance: `usd(n)` 2-digit on `Math.abs(n)`.
- Balance sheet: `fmt(n)` is plain number 2-digit (no `$`), returns `"—"` for 0.
- `pct(n)` → `n.toFixed(1) + "%"`, `"—"` when null.

### 0.5 `.kiln-table` / print
There is **no** literal `.kiln-table` CSS class in the reports source. "Printable table" behaviour is achieved per-report via an inline `<style>{` @media print {…} `}</style>` block (typically `@page { size: landscape; … }`, shrinking font to 7–8pt, tightening cell padding, and unhiding `overflow-x-auto`). Filter controls and export buttons are wrapped in `print:hidden`. Detail tables also constrain `description`/`vendor`/`notes` column widths via `th/td[data-col="…"]` rules.

### 0.6 Shared components
- **`components/project-multi-select.tsx`** — `ProjectMultiSelect({projects, selectedIds:Set<string>, onChange})`. Searchable dropdown checkbox list with "All"/"Clear", status dots (`active`=green, `on_hold`=yellow, `completed`=blue, `archived`=gray), trigger label adapts (`Select projects…` / `All N projects` / `CODE — Name` / `N projects selected`).
- **`components/column-picker.tsx`** — `ColumnPicker({columns: {key,label,required?}[], storageKey, onHiddenChange?})`. Persists a hidden-key array to `localStorage[storageKey]`. Hides columns **only on screen** by injecting `<style>@media screen { [data-col="KEY"] { display: none !important; } }</style>` — so print/PDF and Excel still include every column. `required` columns cannot be hidden. Storage keys used: `cols_cost_detail`, `cols_vendor_detail`, `cols_commitment_detail`, `cols_co_log`, `cols_gate_detail`.
- **`components/reporting-package-button.tsx`** — `ReportingPackageButton({projects:{id,name,code}[]})`. A dropdown that, on "Open Both Reports", calls `window.open('/reports/cost-management?projectId='+id,'_blank')` and `window.open('/reports/balance-sheet?projectId='+id,'_blank')`. Uses legacy single `?projectId=`.
- **`lib/xlsx-helpers.ts`** — export helpers (full source):
  ```ts
  export const CURRENCY_FMT = '"$"#,##0_);("$"#,##0)'; // matches "$1,234" / "($1,234)"
  export const PERCENT_FMT = "0.0%";
  export function freezeHeader(ws, rowCount, colCount = 0) { // sets ws["!views"] frozen pane
    ws["!views"] = [{ state:"frozen", xSplit:colCount, ySplit:rowCount, topLeftCell:cellRef(rowCount,colCount), activePane:"bottomRight" }];
  }
  export function setColumnFormats(ws, startRow, endRow, cols:number[], fmt) {
    for (let r=startRow; r<=endRow; r++) for (const c of cols) {
      const cell = ws[cellRef(r,c)]; if (cell && cell.t === "n") cell.z = fmt; // only numeric cells
    }
  }
  // cellRef(row,col) -> A1-style ref (0-indexed row/col), spreadsheet-letter columns.
  ```
  All Excel exports use a dynamic `import("xlsx")` (SheetJS) inside a `useCallback`, build an array-of-arrays (`aoa_to_sheet`), set `!cols` widths, `!merges` for the 1–3 title rows, apply `setColumnFormats`/`freezeHeader`, then `XLSX.writeFile(wb, filename)`. The Excel button icon is a custom green (`#1D6F42`) SVG `<ExcelIcon>`. Print button calls `window.print()`.

### 0.7 On-demand AppFolio sync from report pages
Several report **controls** (client components) trigger a sync **before** navigating to the report URL, so freshly-pulled data appears. The pattern (in `handleRun`):
```ts
const toSync = projects.filter(p => selectedIds.has(p.id) && p.appfolio_property_id);
if (toSync.length === 0) { router.push(buildUrl(...)); return; }
setSyncStatus("syncing");
startTransition(async () => {
  const results = await Promise.all(toSync.map(p =>
    fetch("/api/appfolio/sync", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ propertyId: p.appfolio_property_id, fromDate, toDate }) }).then(r => r.json())
  ));
  const total = results.reduce((s,r) => s + (r.records_upserted ?? 0), 0);
  setSyncStatus("done"); setSyncMsg(`Synced ${total} records …`);
  router.push(buildUrl(...)); router.refresh();
});
```
Per-report sync windows:
- **PCM**: `fromDate` = one year ago (today − 1yr); `toDate` = `asOf`, but clamped to yesterday if `asOf >= today` (since intraday rows lack categories). Endpoint `/api/appfolio/sync`.
- **Cost Detail / Vendor Detail / Gate Detail / [projectId] picker**: `fromDate: "2000-01-01"`, `toDate: asOf` (or `today` for the `[projectId]` picker). Endpoint `/api/appfolio/sync`.
- **Balance Sheet**: endpoint `/api/appfolio/sync-balance-sheet`, body `{ propertyId, asOfDate: asOf, accountingBasis: basis }`.
- **Commitment Detail, Change Order Log, Trial Balance**: **no** sync on run (pure DB reads); they just `router.push`.

### 0.8 ReportRestorer (filter persistence)
Each report (except change-orders, trial-balance, commitment uses a variant) has a `report-restorer.tsx` client component rendered only in the empty (no-params) state. Two effects:
1. **bfcache refresh**: `window.addEventListener("pageshow", e => { if (e.persisted) router.refresh(); })` — forces server re-fetch when restored from back/forward cache.
2. **restore-last-filter**: on mount, if the URL has no project/filter params, read `localStorage[<key>]`. If `saved.savedDate !== todayISO` it deletes the entry (filters only persist for the current calendar day) and stops. Otherwise it reconstructs a URL (`projectIds` joined, plus other saved params) and `router.replace(url); router.refresh()`. Supports legacy single `projectId` → `[projectId]`.

Each report's controls `handleRun` writes `localStorage[<key>]` as `{ projectIds:[...], …filters, savedDate: new Date().toISOString().slice(0,10) }`. Keys: PCM `pcmr_last_filter`, cost-detail `cost_detail_last_filter`, vendor-detail `vendor_detail_last_filter`, commitment `commitment_detail_last_filter`, balance-sheet `bsr_last_filter`, gate-detail `gate_detail_last_filter`. (Change-order log and trial-balance do not persist filters.)

---

## 1. Reports index — `/reports`
File: `app/(dashboard)/reports/page.tsx`. Static client-less RSC. Renders a 2-column grid of cards (`AVAILABLE_REPORTS`) linking to: `/reports/cost-management`, `/reports/cost-detail`, `/reports/vendor-detail`, `/reports/commitment-detail`, `/reports/change-orders`, `/reports/balance-sheet`. (Trial Balance and Gate Detail are not on the index but are reachable by URL / drill-down.) Each card has an icon (lucide: BarChart3, Receipt, Building2, FileText, ClipboardCheck, Scale) and description.

---

## 2. Project Cost Management Report (PCM) — `/reports/cost-management` ★ MOST IMPORTANT
File: `app/(dashboard)/reports/cost-management/page.tsx`.

### 2.1 Route & query params
- `?projectIds=id1,id2` (comma-separated) — primary. Legacy `?projectId=id` also accepted (single). Parsed: `(searchParams.projectIds ?? searchParams.projectId)?.split(",").map(trim).filter(Boolean)`.
- `&asOf=YYYY-MM-DD` — report "as of" date (default = today).
- `&gateId=<uuid>` — optional. When present, all budget/CO/commitment/cost queries are restricted to that single gate.
- Empty state: if no `projectIds` at all, renders controls + `<ReportRestorer/>` + a "select projects" placeholder.

### 2.2 Data sources (Supabase tables)
1. `projects` (id, name, code, appfolio_property_id, status) — scoped to accessible ids.
2. `cost_categories` (id, name, code, description, display_order) where `is_active = true`, ordered by `display_order`. **`description` is used as the report "section" grouping** (fallback `"Other"`).
3. `gates` (id, project_id, name, sequence_number, status) `.in("project_id", authorizedProjectIds)` ordered by sequence. `budgetGateIds = filterGateId ? [filterGateId] : allGateIds`.
4. `gate_budgets` (cost_category_id, original_budget, approved_co_amount) `.in("gate_id", budgetGateIds)`. → columns A and B.
5. `change_orders` (cost_category_id, amount) `status = "proposed"` AND `proposed_date <= asOf`, scoped by `gate_id` (if gate filter) else `project_id`. → column D.
6. `contracts` (id, cost_category_id, revised_value, **+ nested `contract_line_items(cost_category_id, amount)`**) `status != "terminated"` AND `(execution_date is null OR execution_date <= asOf)`, scoped by gate or project. → column G.
7. `change_orders` again (contract_id, cost_category_id, amount) `status = "approved"` `.in("contract_id", sovContractIds)` — only for SOV contracts. → adds to G per cost code.
8. `transaction_gate_assignments` (appfolio_transaction_id) `.eq("gate_id", filterGateId)` — only when gate filter active.
9. `appfolio_transactions` (id, cost_category_code, cost_category_name, vendor_name, description, paid_amount, unpaid_amount, bill_date, payment_status, check_number, reference_number) `.in("appfolio_property_id", linkedPropertyIds)` AND `bill_date <= min(asOf, yesterday)`, optionally `.in("id", assignedTxIds)` when gated. → columns J and K.

### 2.3 The 13 columns A–M — exact definitions
Header is two rows; column letters with formulas shown in the UI: A, B, C=A+B, D, E=C+D, F=A−E, G, H=G÷C, I=C−G, J, K, L=J+K, M=C−L.

| Col | UI label | Meaning | Source / formula |
|----|----------|---------|------------------|
| **A** | Original Budget | Sum of `original_budget` across all (selected) gates' budget lines for the category | `budgetMap[cat].a` = Σ `gate_budgets.original_budget` |
| **B** | Authorized Adj. | Approved change orders, budget-level (the per-gate `approved_co_amount` field) | `budgetMap[cat].b` = Σ `gate_budgets.approved_co_amount` |
| **C** | Current Budget | `c = a + b` |
| **D** | Proposed Adj. | Pending (not-yet-approved) change orders dated ≤ asOf | `proposedMap[cat]` = Σ `change_orders.amount` where `status='proposed' AND proposed_date<=asOf` |
| **E** | Projected Budget | `e = c + d` |
| **F** | Variance | Original vs projected | `f = a - e` (UI: red if <0, green if >0) |
| **G** | Total Committed | Contracts + approved contract COs (see SOV logic below) | `committedMap[cat]` |
| **H** | % Committed | `h = c > 0 ? (g / c) * 100 : null` (rendered `pct`) |
| **I** | Uncommitted | `i = c - g` |
| **J** | Costs to Date Paid | Incurred & paid AppFolio costs through report date | `paidMap[cat]` = Σ `appfolio_transactions.paid_amount` |
| **K** | Costs to Date Unpaid | Incurred & unpaid through report date | `unpaidMap[cat]` = Σ `appfolio_transactions.unpaid_amount` |
| **L** | Total Costs Incurred | `l = j + k` |
| **M** | Balance to Complete | Remaining gate spend | `m = c - l` |

### 2.4 Column G commitment logic (SOV → G) — exact code
```ts
// committedMap: cost_category_id -> committed $
for (const c of rawContracts) {
  if (c.contract_line_items.length > 0) {
    // SOV: each line item's amount -> its own cost code
    for (const li of c.contract_line_items)
      committedMap.set(li.cost_category_id, (committedMap.get(li.cost_category_id) ?? 0) + Number(li.amount));
    // Approved COs on top, attributed by cost code
    for (const co of (approvedCosByContract.get(c.id) ?? []))
      committedMap.set(co.cost_category_id, (committedMap.get(co.cost_category_id) ?? 0) + Number(co.amount));
  } else {
    // No SOV: revised_value (already includes approved COs) -> single cost category
    committedMap.set(c.cost_category_id, (committedMap.get(c.cost_category_id) ?? 0) + Number(c.revised_value));
  }
}
```
`approvedCosByContract` is built only for `sovContractIds` (contracts with ≥1 line item), from `change_orders` where `status='approved'`. Non-SOV contracts rely on `revised_value` which already bakes in approved COs (so COs are NOT added again).

### 2.5 J/K AppFolio actuals — exact code
```ts
for (const tx of rawTx) {
  txTotal++;
  const code = (tx.cost_category_code ?? "").trim().toUpperCase();
  const paid = Number(tx.paid_amount), unpaid = Number(tx.unpaid_amount);
  const catId = code ? (codeToCategory.get(code) ?? null) : null;
  if (catId) {
    txMatched++;
    paidMap.set(catId, (paidMap.get(catId) ?? 0) + paid);
    unpaidMap.set(catId, (unpaidMap.get(catId) ?? 0) + unpaid);
  } else {
    // unmatched: bucket by displayCode for the warning + phantom section
    const displayCode = code || "(no cost category)";
    const prev = unmatchedCats.get(displayCode) ?? { name: tx.vendor_name || tx.cost_category_name || displayCode, paid:0, unpaid:0 };
    unmatchedCats.set(displayCode, { name: prev.name, paid: prev.paid+paid, unpaid: prev.unpaid+unpaid });
    // also collect raw txns per code for the click-through modal
  }
}
```

### 2.6 Row build, sections, totals — exact code
```ts
const rows = categories.map(cat => {
  const budget = budgetMap.get(cat.id) ?? { a:0, b:0 };
  const a = budget.a, b = budget.b, c = a + b;
  const d = proposedMap.get(cat.id) ?? 0, e = c + d, f = a - e;
  const g = committedMap.get(cat.id) ?? 0;
  const h_pct = c > 0 ? (g / c) * 100 : null;
  const i = c - g;
  const j = paidMap.get(cat.id) ?? 0, k = unpaidMap.get(cat.id) ?? 0, l = j + k, m = c - l;
  return { id:cat.id, code:cat.code, name:cat.name, section: cat.description ?? "Other",
    a_original:a, b_authorized:b, c_current:c, d_proposed:d, e_projected:e, f_variance:f,
    g_committed:g, h_pct_committed:h_pct, i_uncommitted:i, j_paid:j, k_unpaid:k, l_total_incurred:l, m_balance:m };
});
```
- **Phantom "AppFolio — Unmatched Costs" section**: one row per unmatched code with A–I = 0, J=paid, K=unpaid, L=paid+unpaid, M=−(total). Each unmatched row is clickable → opens `<UnmatchedCostModal>` listing the raw transactions.
- Rows are grouped by `section` (insertion-ordered via `sectionOrder`).
- **Zero-row suppression** — a row renders only if `rowHasData(r)`: `a_original !== 0 || b_authorized !== 0 || d_proposed !== 0 || g_committed !== 0 || l_total_incurred !== 0`.
- **Section subtotal** uses `reduce(addToTotals, emptyTotals())`; section H recomputed `st.c > 0 ? (st.g/st.c)*100 : null`.
- **Grand total** sums only `rowHasData` rows. `SectionTotals` tracks a,b,c,d,e,f,g,i,j,k,l,m (note: H and percent are always recomputed, never summed).
  ```ts
  function addToTotals(t, r) { return { a:t.a+r.a_original, b:t.b+r.b_authorized, c:t.c+r.c_current,
    d:t.d+r.d_proposed, e:t.e+r.e_projected, f:t.f+r.f_variance, g:t.g+r.g_committed, i:t.i+r.i_uncommitted,
    j:t.j+r.j_paid, k:t.k+r.k_unpaid, l:t.l+r.l_total_incurred, m:t.m+r.m_balance }; }
  ```

### 2.7 Drill-down links (single-project only for cost links)
- **G cell** (any selection, when g≠0): `→ /reports/commitment-detail?projectIds=<ids>&categoryCode=<code>&asOf=<asOf>`.
- **J cell** (when j≠0 and single project has appfolio): `→ /reports/cost-detail?projectId=<id>&asOf=<asOf>&categoryCode=<code>&paymentFilter=paid`.
- **K cell**: same with `paymentFilter=unpaid`.
- **L cell**: same without paymentFilter.
- Unmatched warning rows link to `/reports/cost-detail?...&categoryCode=<code>` (single project).

### 2.8 Diagnostics / warnings
The page prints (in `print:hidden` blocks): budget load error; "no gates" / "no budgets saved" / "budgets all $0" / loaded-budget summary; "not linked to AppFolio" (J/K/L = $0); "no transactions found"; an expandable `<details>` listing unmatched cost-category codes with $ totals and per-code drill links.

### 2.9 Controls (`report-controls.tsx`)
`ProjectMultiSelect` + Gate `<select>` (only gates of selected projects; cleared if the chosen gate no longer belongs) + Report Date `<input type=date>` + Run button. `buildUrl` sorts ids, sets `projectIds`, `gateId`, `asOf`. On run, persists `pcmr_last_filter` then syncs AppFolio (1yr-ago → asOf-clamped-yesterday) for each linked project before navigating.

### 2.10 Export (`export-buttons.tsx`) & print
Excel sheet "Cost Management Report": rows = `[projectLabel]`, title line, blank, `HEADERS` (Code, Category, A–M with full labels), then per section: section name row → line rows (`toRowArr`, currency rounded to 2dp via `fmt`) → `"<section> — Subtotal"` row → blank; finally `GRAND TOTAL`. Same zero-suppression filter as screen. `!cols` widths `[12,36,...13×20]`; title rows 0 & 1 merged across all 15 columns; currency format applied to cols `[2,3,4,5,6,7,8,10,11,12,13,14]`, percent to col `9`; `freezeHeader(ws,4)`. Filename `${sanitizedProjectLabel}_Cost_Management_${asOf}.xlsx`. Print: inline `@media print` makes `#pcm-report` landscape, 7pt.

---

## 3. Cost Detail Report — `/reports/cost-detail`
Files: `page.tsx`, `cost-detail-table.tsx`, `report-controls.tsx`, `report-restorer.tsx`, `export-buttons.tsx`.

### 3.1 Route & params
- `?projectIds=` (or legacy `?projectId=`), `&asOf=`, `&categoryCode=`, `&paymentFilter=paid|unpaid`, `&gateId=`.
- Empty state when no `projectIds`.

### 3.2 Data sources
- `users` (role) — to compute `isAdmin` (`admin`|`development_lead`) and `canEditGate` (`admin`|`project_manager`|`development_lead`).
- `projects`, `cost_categories` (id,name,code, active, by display_order).
- **`appfolio_transactions`** main read — many columns (id, appfolio_property_id, appfolio_bill_id, vendor_name, gl_account_id/name, cost_category_code/name, bill_date, due_date, payment_date, invoice_amount, paid_amount, unpaid_amount, payment_status, payment_type, check_number, reference_number, description) `.in("appfolio_property_id", linkedPropertyIds)`, `bill_date <= min(asOf,yesterday)`, `.order("bill_date", desc).limit(50000)`.
  - `paymentFilter=paid` → `.gt("paid_amount", 0)`; `unpaid` → `.gt("unpaid_amount", 0)`.
  - `categoryCode` SQL pre-narrow: `.ilike("cost_category_code", "${prefix}%")` where `prefix = categoryCode.split(/\s+/)[0]`.
  - **Diagnostic count queries** (`count:"exact", head:true`): total rows / after date / after payment / after-SQL-category — surfaced in the empty-state for debugging.
- `transaction_notes` (appfolio_bill_id, note) `.in("appfolio_bill_id", billIds)`.
- `transaction_gate_assignments` (appfolio_transaction_id, gate_id, is_override) `.in("appfolio_transaction_id", txIds)`.
- `gates` (id, project_id, name, sequence_number) for selected projects.

### 3.3 Calculation / filtering logic
- After the SQL pre-narrow, a **JS tightening** re-applies the PCM matching rule: accept tx whose upper-cased code equals the target full code OR target prefix, OR whose own prefix matches (symmetric). Empty codes rejected.
  ```ts
  const target = categoryCode.trim().toUpperCase();
  const targetPrefix = target.split(/\s+/)[0];
  const accepted = new Set([target]); if (targetPrefix && targetPrefix !== target) accepted.add(targetPrefix);
  transactions = transactions.filter(tx => {
    const c = (tx.cost_category_code ?? "").trim().toUpperCase();
    if (!c) return false;
    if (accepted.has(c)) return true;
    return accepted.has(c.split(/\s+/)[0]);
  });
  ```
- **Gate filter** is applied in-memory after assignments load: keep tx where `gateAssignmentByTxId.get(tx.id)?.gate_id === gateIdFilter`.
- Each table row is enriched with project (via `appfolio_property_id → project`), gate (assignment + name/sequence + `is_override` + the project's gate list for editing), and note.
- `appfolioBaseUrl = process.env.APPFOLIO_DATABASE_URL ? "https://"+… : null` (server-only; used for deep links to `/payable_bills/{billId}`). Env var never reaches client — only the resolved base URL is passed.

### 3.4 Interactive table (`cost-detail-table.tsx`, client)
14 columns: project (only when >1 project), bill_date, vendor (link `/vendors/<name>`), description, gl_account, cost_category (editable via `<TransactionCategoryCell>` if canEdit), invoice_amt (link to AppFolio bill if base url, else plain), paid (green), unpaid (amber, "—" if 0), status (pill: paid=green/unpaid=amber/else slate), check_num, gate (editable `<TransactionGateCell>`), reference, notes (`<TransactionNoteCell>`, editable if isAdmin).
- **Per-column sort**: click header cycles asc→desc→none; numeric vs string `sortValue` per column.
- **Per-column filter**: a popover text input per header; case-insensitive substring on each column's `filterValue`. Active filter count + "Showing X of Y" banner + "Clear all".
- **Footer totals** (recomputed over the filtered+sorted set): `totalInvoice`, `totalPaid`, `totalUnpaid` as plain reduces.
- Sticky header; landscape print CSS.

### 3.5 Export & restore
Excel "Cost Detail": title (`projectCode — projectName`), subtitle (`Cost Detail Report — categoryLabel — As of date`), blank, header `[Gate, Bill Date, Vendor, Description, GL Account, GL Account Name, Cost Category Code, Cost Category Name, Invoice Amount, Paid, Unpaid, Status, Check #, Reference]` (14 cols), per-tx rows, blank, `TOTAL — N transactions` row with summed invoice/paid/unpaid at cols 8/9/10. Currency cols `[8,9,10]`; merges title rows over 14 cols; `freezeHeader(ws,4)`. Filename `${projectCode}_Cost_Detail_${asOf}.xlsx`. Restorer key `cost_detail_last_filter` (restores projectIds, categoryCode, asOf).

---

## 4. Vendor Detail Report — `/reports/vendor-detail`
Files: `page.tsx`, `vendor-detail-table.tsx`, `report-controls.tsx`, `report-restorer.tsx`, `export-buttons.tsx`.

### 4.1 Route & params
- `?projectIds=`/legacy `?projectId=`, `&vendorName=`, `&categoryCode=`, `&asOf=`, `&gateId=`.
- **"None selected = all projects"** — unlike PCM, an empty project set means query ALL accessible linked properties. Empty placeholder shows only when **no run param at all** (`hasRunParam` checks asOf/projectIds/projectId/vendorName/categoryCode all undefined).

### 4.2 Data sources
- `users.role`, `projects`, `cost_categories` (as above).
- `project_vendors` (name) `.in("project_id", selectedOrAllAccessible)` `is_active=true` → dedup'd vendor-name list for the autocomplete `<datalist>`.
- `appfolio_transactions` — same column set as cost-detail, `bill_date <= min(asOf,yesterday)`, `.in("appfolio_property_id", propertyIdsToQuery)` (selected projects' properties, or all accessible linked when none selected). `vendorName` → `.ilike("vendor_name", "%${vendorName}%")`. Ordered `bill_date desc`.
- `transaction_notes`, `transaction_gate_assignments`, `gates` (same as cost-detail).

### 4.3 Calculation / filtering
- **Category filter (JS, after fetch)**: stricter than cost-detail — accepts only exact full-code or exact prefix match (no symmetric prefix-of-tx widening):
  ```ts
  const accepted = new Set([target]); if (targetPrefix !== target) accepted.add(targetPrefix);
  transactions = transactions.filter(tx => { const c=(tx.cost_category_code??"").trim().toUpperCase(); return c.length>0 && accepted.has(c); });
  ```
- **Gate filter** in-memory same as cost-detail.
- Rows carry a `detail_base` link to `/reports/cost-detail?projectId=<txProject>&asOf=<asOf>&categoryCode=<code>` so invoice/paid/unpaid cells deep-link (paid/unpaid append `&paymentFilter=paid|unpaid`).

### 4.4 Table (`vendor-detail-table.tsx`)
Same 14-column sortable/filterable engine as cost-detail. Differences: cost_category is **read-only** (not editable here); invoice/paid/unpaid cells link to AppFolio bill if base url present, otherwise to `detail_base`. `showProjectCol = projectIds.length !== 1`.

### 4.5 Export & restore
Excel "Vendor Detail": title `Vendor Detail Report — vendorLabel`, `As of date`, blank, 17-col header `[Project Code, Project Name, Gate, Bill Date, Vendor, Description, GL Account, GL Account Name, Cost Category Code, Cost Category Name, Invoice Amount, Paid, Unpaid, Status, Payment Type, Check #, Reference]`, rows, blank, TOTAL row (invoice/paid/unpaid at cols 10/11/12). Currency cols `[10,11,12]`; merges over 17 cols; `freezeHeader(ws,4)`. Filename `Vendor_Detail_${safeVendor}_${asOf}.xlsx`. Restorer key `vendor_detail_last_filter`.

---

## 5. Commitment Detail Report — `/reports/commitment-detail`
Files: `page.tsx`, `report-controls.tsx`, `report-restorer.tsx`, `export-buttons.tsx`.

### 5.1 Route & params
- `?projectIds=`/legacy `?projectId=`, `&categoryCode=`, `&contractStatus=active_complete|active|complete|all` (default `active_complete`), `&asOf=`.
- "None selected = all projects". Empty placeholder when no run params.

### 5.2 Data sources
- `projects` (id,name,code,status), `cost_categories`.
- **`contracts`** with nested relations:
  ```
  id, project_id, vendor_name, contract_number, description,
  original_value, approved_co_amount, revised_value, retainage_pct,
  execution_date, status, cost_category_id,
  category:cost_categories(id,name,code),
  contract_gates(gate:gates(id,name,sequence_number)),
  contract_line_items(id,cost_category_id,description,amount,category:cost_categories(id,name,code))
  ```
  Base filter: `(execution_date is null OR execution_date <= asOf)` AND (default) `status != "terminated"`. `contractStatus=active`→`status='active'`; `complete`→`'complete'`; `all`→**re-built query without the terminated exclusion**. Project scoping: selected `projectIds`, else (non-admin) all accessible.
- **`change_orders`** (contract_id, cost_category_id, co_number, amount, category) `.in("contract_id", sovContractIds)` `status='approved'` — for SOV contracts only.

### 5.3 Calculation (SOV → base/COs/Total per category)
For each contract:
- **SOV contract** (`contract_line_items.length > 0`): group line items by `cost_category_id` → `baseAmount = Σ amount`. Group approved COs by category → `approvedCOs`. Emit one row per category appearing in lines or COs (skipped unless it matches `filterCatId`). `totalCommitted = base + coAmt`.
- **Non-SOV contract**: one row under `c.cost_category_id` with `baseAmount = original_value`, `approvedCOs = approved_co_amount`, `totalCommitted = revised_value`.
Rows sorted by `costCategoryCode` then `vendorName`. Totals = simple Σ of base/COs/totalCommitted. The legend explicitly notes **Total Committed matches PCM column G**.

### 5.4 Controls / table / export
- Controls: `ProjectMultiSelect` + Cost Category `<select>` + Contract Status `<select>` (Active & Complete / Active Only / Complete Only / All incl. Terminated) + As-of date + Run. **No AppFolio sync.** Persists `commitment_detail_last_filter`.
- Table columns: project (if showProjectCol), vendor (link to `/projects/<pid>/contracts/<cid>`), contract #, description, cost category, gate(s), execution date, status pill, base amount, approved COs, total committed (bold), retainage %. `usd` 0-dp. Footer totals.
- Excel "Commitment Detail": dynamic headers (project cols only if showProjectCol), currency cols computed from `baseCol = showProjectCol ? 9 : 7` (Base/Approved/Total). Filename `Commitment_Detail_${safeCategory}_${asOf}.xlsx`. `ColumnPicker` key `cols_commitment_detail`.

---

## 6. Change Order Log — `/reports/change-orders`
Files: `page.tsx`, `log-controls.tsx`, `log-export.tsx`. (No restorer.)

### 6.1 Route & params (note: `searchParams` is a **Promise** here, `await`ed)
- `?projectId=` (single), `&status=all|proposed|approved|rejected|voided`, `&categoryId=<uuid>`, `&dateFrom=`, `&dateTo=` (range on `proposed_date`), `&type=all|contract|budget`.
- Placeholder shown until any filter param exists (`hasFilter`).

### 6.2 Data sources
- `projects` (id,name,code,status), `cost_categories`.
- **`change_orders`** with relations:
  ```
  id, co_number, description, amount, status, proposed_date, approved_date, rejection_reason, notes, teams_url,
  gate_id, contract_id, cost_category_id,
  gate:gates(id,name,project_id), contract:contracts(id,vendor_name), category:cost_categories(id,name,code)
  ```
  `.order("proposed_date", desc)`. Server filters: `status` (if not "all"), `cost_category_id = categoryId`, `proposed_date >= dateFrom`, `proposed_date <= dateTo`, `type=contract`→`.not("contract_id","is",null)`, `type=budget`→`.is("contract_id", null)`.

### 6.3 Logic
- **Project filter happens after fetch** because `project_id` lives on the joined `gate` (`co.gate.project_id`). Rows are kept only if their gate's project is in the accessible set, and (if `projectId` set) equals it.
- `isBudgetCO = !co.contract_id`.
- Totals: `totalAmount` (all rows), `approvedTotal` (status=approved), `proposedTotal` (status=proposed) — shown as 3 summary cards.

### 6.4 Table / export
- Status badges: proposed=amber, approved=green, rejected=red, voided=gray.
- Columns: project (link `/projects/<id>`, if showProjectCol = no single project), CO # (link to contract if any), status, gate (link `/projects/<pid>/gates/<gid>`), contract/type (vendor link OR "Budget CO" pill), cost category, description (+ rejection reason if rejected), amount, proposed date, approved date, notes. Footer TOTAL amount.
- Excel "Change Order Log": title + `Generated <today>`, dynamic headers (`Type` column added: "Budget CO"/"Contract CO"), amount currency col index `showProjectCol ? 10 : 8`. Filename `Change_Order_Log_${today}.xlsx`. `ColumnPicker` key `cols_co_log`.

---

## 7. Balance Sheet Report — `/reports/balance-sheet`
Files: `page.tsx`, `report-controls.tsx`, `report-restorer.tsx`, `export-buttons.tsx`.

### 7.1 Route & params
- `?projectIds=`/legacy `?projectId=`, `&asOf=`, `&basis=Cash|Accrual` (default Accrual; any value ≠ "Cash" → Accrual). Empty state when no projectIds.

### 7.2 Data source — `gl_balances`
For each selected project's `appfolio_property_id`:
1. Find the **most recent snapshot date ≤ asOf**:
   ```ts
   supabase.from("gl_balances").select("as_of_date")
     .eq("appfolio_property_id", propId).eq("accounting_basis", basis)
     .lte("as_of_date", asOf).order("as_of_date", desc).limit(1).single();
   ```
2. Load that snapshot's rows: `select("gl_account_id, gl_account_name, gl_account_number, account_type, balance, as_of_date")` `.eq` property/basis/`as_of_date` ordered by `gl_account_number`.

### 7.3 Multi-property aggregation
- Single property → rows as-is. Multiple → aggregate by `gl_account_number ?? gl_account_id`, summing `balance`; re-sort by account number. `datesVary` true if properties returned different snapshot dates (warning shown).

### 7.4 Cash vs Accrual & account_type grouping
- `basis` selects which `gl_balances.accounting_basis` snapshot to read — that is the entire Cash-vs-Accrual difference.
- **`normaliseType(account_type, accountNumber)`**:
  ```ts
  const lower = t.toLowerCase();
  if (lower.startsWith("asset")) return "Asset";
  if (lower.startsWith("liab"))  return "Liability";
  if (lower.startsWith("equit") || lower.startsWith("capital")) return "Equity";
  // fallback by account-number first digit: 1=Asset, 2=Liability, 3=Equity
  const d = accountNumber?.trim().charAt(0);
  if (d==="1") return "Asset"; if (d==="2") return "Liability"; if (d==="3") return "Equity";
  return t; // unknown types fall into their own sections
  ```
- Section order `["Asset","Liability","Equity"]`; unknown types rendered after.

### 7.5 Totals & balance check
```ts
const totalAssets = Σ Asset.balance, totalLiabilities = Σ Liability.balance, totalEquity = Σ Equity.balance;
const liabPlusEquity = totalLiabilities + totalEquity;
const balanceDiff = totalAssets - liabPlusEquity;
const isBalanced = Math.abs(balanceDiff) < 0.01;
```
Layout: ASSETS section → TOTAL ASSETS; "LIABILITIES & CAPITAL" with Liabilities sub-section (Total Liabilities) + Capital sub-section (Total Capital) → TOTAL LIABILITIES & CAPITAL (=liabPlusEquity). Footer row shows "In Balance" or "⚠ Out of Balance" + `fmt(balanceDiff)` (red when out). Account name cells colored blue; numbers `fmt` (2dp, "—" for 0).

### 7.6 Controls / export
- Controls: `ProjectMultiSelect` + As-of date + Basis `<select>` + Run. On run → persists `bsr_last_filter`, syncs **`/api/appfolio/sync-balance-sheet`** (`{propertyId, asOfDate:asOf, accountingBasis:basis}`) per linked project, then navigates.
- Excel "Balance Sheet": projectName / "Balance Sheet" / `As of date · basis Basis` (3 merged title rows over 3 cols) / header `[Account Number, Account Name, Balance]`; per section: label row, account rows, `Total <label>`, blank; then `TOTAL ASSETS`, `TOTAL LIABILITIES & CAPITAL`, blank, `In Balance`/`OUT OF BALANCE`. Currency col `[2]` from row 5; `freezeHeader(ws,5)`. Filename `${projectCode}_Balance_Sheet_${safeDate}.xlsx`.

---

## 8. Trial Balance — `/reports/trial-balance`
Files: `page.tsx`, `report-controls.tsx`, `export-button.tsx`. (No restorer.)

### 8.1 Route & params (`searchParams` is a Promise)
- `?projectId=` (single; blank = all accessible projects), `&dateFrom=`, `&dateTo=` (default today), `&run=1` (sentinel used when running with all-projects/no-filters). Placeholder until any param present.

### 8.2 Data sources
- `projects` (id,name,code,appfolio_property_id,status).
- `appfolio_transactions` (id, appfolio_property_id, gl_account_id, gl_account_name, invoice_amount, paid_amount, unpaid_amount) `.in("appfolio_property_id", linkedPropertyIds)`, `bill_date <= min(dateTo,yesterday)`, optional `bill_date >= dateFrom`, ordered by gl_account_id.
- `gl_balances` (gl_account_id, gl_account_name) for the same properties `as_of_date <= effectiveDateTo` — used to **seed $0 rows** for known accounts with no transactions.

### 8.3 Calculation (debit/credit/balance + balanced check)
Aggregate per GL account (`key = gl_account_id||gl_account_name`):
```ts
row.debit  += Number(tx.invoice_amount);       // Debit = total invoice amount
row.credit += Number(tx.paid_amount);          // Credit = total paid amount
row.netBalance += Number(tx.invoice_amount) - Number(tx.paid_amount); // DR if >=0, CR if <0
```
Then seed any `gl_balances` account not already present as a 0/0/0 row. Rows sorted by `glAccountId`. Grand totals are simple sums. **Balanced check**:
```ts
const isBalanced = Math.abs(grandDebit - grandCredit - grandNetBalance) < 0.01;
```
(i.e. Debit = Credit + NetBalance is an algebraic identity per row, so this is a data-integrity assertion.) Each row shows a DR/CR pill (`netBalance >= 0` → DR amber, else CR blue). `usd` uses `Math.abs`.

### 8.4 Table / export
Columns: GL Account, Account Name, Debit, Credit (green), Net Balance (blue if CR / amber if DR-positive), DR/CR pill. Footer shows `✓ Balanced`/`✗ Out of Balance` chip + grand debit/credit/net + DR/CR. Excel "Trial Balance": title `Trial Balance — projectLabel`, dateLabel, blank, header `[GL Account, Account Name, Debit, Credit, Balance]`, rows, blank, `TOTAL` row. Currency cols `[2,3,4]` from row 4; `freezeHeader(ws,4)`. Filename `trial-balance-${Date.now()}.xlsx`. (This export imports `xlsx` statically, not via dynamic import, and uses lucide `Download` icon instead of the green Excel SVG.)

---

## 9. Gate Detail Report — `/reports/gate-detail`
Files: `page.tsx`, `report-controls.tsx`, `report-restorer.tsx`, `export-buttons.tsx`.

### 9.1 Route & params
- `?projectId=` (single; legacy `?projectIds=` uses first id only), `&gateId=`, `&categoryCode=`, `&asOf=`, `&paymentFilter=paid|unpaid`. Empty state when no project.

### 9.2 Data sources & logic
- `users.role` (isAdmin/canEditGate), `projects`, `cost_categories`, `gates` (all accessible, grouped by project for the dropdown).
- `relevantGateIds = filterGateId ? [filterGateId] : <all gates of selected project>`.
- **`transaction_gate_assignments`** (appfolio_transaction_id, gate_id, is_override) `.in("gate_id", relevantGateIds)` → list of assigned tx ids.
- **`appfolio_transactions`** `.in("id", assignedTxIds)` AND `.in("appfolio_property_id", linkedPropertyIds)` AND `bill_date <= min(asOf,yesterday)`; `categoryCode` → `.ilike("cost_category_code", categoryCode)` (exact ilike, **no** prefix logic here); `paymentFilter` → `.gt("paid_amount"/"unpaid_amount", 0)`; ordered `bill_date desc`.
- `transaction_notes` for displayed bills.
- This report is fundamentally **assignment-driven**: a transaction only appears if it has a row in `transaction_gate_assignments` for the relevant gate(s). If no assignments / no AppFolio link, a guidance empty-state explains auto-assignment on sync + manual assignment via the pencil in Cost/Vendor detail.
- Totals: invoice/paid/unpaid simple reduces. `showProjectCol = false` (always single project).

### 9.3 Table / controls / export
- Columns: gate (editable `<TransactionGateCell>`), bill date, vendor, description, GL account, cost category, invoice amt (AppFolio deep link if base url), paid (green), unpaid (amber), status pill, check #, reference, notes (`<TransactionNoteCell>`). Footer totals.
- Controls: single Project `<select>` + Gate `<select>` (gates of that project, cleared on project change) + Cost Category + Payment + As-of + Run. Syncs `/api/appfolio/sync` (`2000-01-01`→asOf) for the project. Persists `gate_detail_last_filter`.
- Excel "Gate Detail": title `Gate Detail Report — reportLabel`, `As of date`, blank, 16-col header (Project Code/Name, Gate, Bill Date, Vendor, Description, GL Account/Name, Cost Category Code/Name, Invoice/Paid/Unpaid, Status, Check #, Reference), rows, TOTAL. Currency cols `[10,11,12]`; `freezeHeader(ws,4)`. Filename `Gate_Detail_${safeLabel}_${asOf}.xlsx`. `ColumnPicker` key `cols_gate_detail`.

---

## 10. Reporting-package landing — `/reports/[projectId]` (Cost Category Report)
Files: `page.tsx`, `project-picker.tsx`.

### 10.1 Route
- Dynamic segment `[projectId]` (`params` is a Promise, awaited). Non-admin without access → `redirect("/reports")`. Missing project → `notFound()`.

### 10.2 Data sources
- `projects` (single + full accessible list for picker), `gates` (ids only for the project), `cost_categories` (id,name,code,display_order, active).
- `gate_budgets` (cost_category_id, original_budget, approved_co_amount, **revised_budget**) `.in("gate_id", gateIds)` — aggregated per category into `{original, co, revised}`.
- `appfolio_transactions` (cost_category_code, cost_category_name, vendor_name, invoice_amount) `.eq("appfolio_property_id", project.appfolio_property_id)` — **no date cap here** (whole history). Actuals matched by **exact upper-cased code** (`codeToCategory` built from exact `cat.code` only — no prefix logic in this report).

### 10.3 Calculation
```ts
const variance = b.revised - actual;                        // revised budget − actual spend
const pctComplete = b.revised > 0 ? (actual / b.revised) * 100 : null;
```
Columns: Original Budget, Approved COs (`co`), Revised Budget (`revised`), Actual Spend (`actual`), Variance (red<0 / green>0), % Complete (red if >100%). Rows hidden when `revised===0 && actual===0`; hidden-count note shown. Grand-total row + `totalPct`. Unmatched AppFolio codes surfaced in yellow diagnostic banners (3 variants: no txns / none matched / partial). `fmtVariance` shows negatives parenthesised.

### 10.4 Project picker (`project-picker.tsx`)
Single `<select>` (with status-suffix labels) + Run. On run, if project has `appfolio_property_id`, syncs `/api/appfolio/sync` (`2000-01-01`→today) then `router.push("/reports/"+projectId)`; otherwise navigates directly.

---

## 11. Cross-report quick reference

| Report | Route | Key params | Main table(s) | Sync on run |
|--------|-------|-----------|---------------|-------------|
| PCM | `/reports/cost-management` | projectIds, asOf, gateId | gate_budgets, change_orders, contracts(+line_items), appfolio_transactions | `/api/appfolio/sync` (1yr) |
| Cost Detail | `/reports/cost-detail` | projectIds, asOf, categoryCode, paymentFilter, gateId | appfolio_transactions (+notes, gate assignments) | `/api/appfolio/sync` (2000-) |
| Vendor Detail | `/reports/vendor-detail` | projectIds, vendorName, categoryCode, asOf, gateId | appfolio_transactions, project_vendors | `/api/appfolio/sync` (2000-) |
| Commitment Detail | `/reports/commitment-detail` | projectIds, categoryCode, contractStatus, asOf | contracts(+line_items+gates), change_orders | none |
| Change Order Log | `/reports/change-orders` | projectId, status, categoryId, dateFrom/To, type | change_orders(+gate,contract,category) | none |
| Balance Sheet | `/reports/balance-sheet` | projectIds, asOf, basis | gl_balances | `/api/appfolio/sync-balance-sheet` |
| Trial Balance | `/reports/trial-balance` | projectId, dateFrom/To, run | appfolio_transactions, gl_balances | none |
| Gate Detail | `/reports/gate-detail` | projectId, gateId, categoryCode, asOf, paymentFilter | transaction_gate_assignments, appfolio_transactions | `/api/appfolio/sync` (2000-) |
| Cost Category | `/reports/[projectId]` | (path param) | gate_budgets, appfolio_transactions | `/api/appfolio/sync` (2000-, via picker) |

---

## Summary
- Reports covered: **Project Cost Management (PCM)**, **Cost Detail**, **Vendor Detail**, **Commitment Detail**, **Change Order Log**, **Balance Sheet**, **Trial Balance**, **Gate Detail**, the **`[projectId]` Cost Category landing**, plus the **`/reports` index** and shared components (`project-multi-select`, `column-picker`, `reporting-package-button`, `lib/xlsx-helpers`).
- PCM's full 13-column engine (A original budget, B authorized adj, C=A+B, D proposed adj, E=C+D, F=A−E, G committed w/ SOV distribution, H=G÷C, I=C−G, J paid, K unpaid, L=J+K, M=C−L) is captured with exact formulas, source tables, the SOV/commitment distribution code, and the AppFolio paid/unpaid matching code.
- Also captured exactly: trial-balance debit/credit/netBalance + `|debit−credit−net|<0.01` balanced check; balance-sheet Cash-vs-Accrual basis selection, `normaliseType` account_type grouping, and `|assets−(liab+equity)|<0.01` balance check; commitment-detail SOV→base/COs/Total (= PCM column G); change-order log gate-derived project filtering; and the `[projectId]` variance/%-complete math.
- All exports build SheetJS array-of-arrays with `CURRENCY_FMT`/`PERCENT_FMT`/`freezeHeader`/`setColumnFormats`; column hiding is screen-only (print/Excel keep all columns); printing uses per-report inline `@media print` landscape CSS (there is no literal `.kiln-table` class). On-demand AppFolio sync is fired from report controls' `handleRun` before navigation as documented per report.


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/03-projects-workflows.md -->
<!-- ============================================================ -->

# KILN — Projects / Contracts / Change Orders / Draws / Gates / Vendors / Documents

Rebuild reference for the project-centric workflows of KILN, a Next.js 14
(App Router / RSC) real-estate-development cost-reporting app. Everything below
is reconstructed verbatim from the server actions and React components so the
business logic can be rebuilt with no repo access.

## 0. Cross-cutting conventions

### Auth & roles
- The Clerk user id is injected as the request header `x-clerk-user-id` (read via
  `(await headers()).get("x-clerk-user-id")`). Server actions read it directly; the
  two Excel API routes use Clerk's `auth()` instead.
- A `users` table row carries `role`, one of:
  `admin`, `development_lead`, `accounting`, `project_manager`, `read_only`.
- Permission gate helpers appear (duplicated) in nearly every actions file:

```ts
// "PM-level" write access — create/edit gates, contracts, COs, draws, vendors, docs
async function requirePM() {
  const userId = (await headers()).get("x-clerk-user-id");
  if (!userId) throw new Error("Not authenticated");
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!data || !["admin", "project_manager", "accounting"].includes(data.role)) {
    throw new Error(`Insufficient permissions (role: ${data?.role ?? "none"})`);
  }
  return { userId, supabase };
}
```

  Note `development_lead` is **not** in the PM set — it cannot create gates,
  contracts, COs, etc. through `requirePM` (only `admin`, `project_manager`,
  `accounting` can).

- Two distinct "admin" gates exist, and they differ:

```ts
// projects/actions.ts — used by linkAppfolioId
async function requireAdmin() { // admin | accounting | development_lead
  if (!data || (data.role !== "admin" && data.role !== "accounting" && data.role !== "development_lead"))
    throw new Error("Admin role required");
}
// projects/actions.ts — used by deleteProject
async function requireStrictAdmin() { // admin | development_lead ONLY
  if (!data || (data.role !== "admin" && data.role !== "development_lead"))
    throw new Error("Admin role required");
}
```

  Whereas the **gates / contracts / vendors / documents** `requireAdmin` is
  `admin || development_lead` only (no accounting). So "admin destructive
  operations" = `admin` + `development_lead`, but project deletion is also that
  same strict set. AppFolio-link editing additionally allows `accounting`.

- All clients are `createAdminClient()` (Supabase service-role). Row-level
  security is **not** relied upon — access scoping is enforced in app code by
  checking `project_users`.

### Access scoping (assigned projects)
- For `read_only` and `project_manager`, queries are scoped to the project ids
  the user is assigned in `project_users (user_id, project_id)`.
- Projects list (`projects/page.tsx`): builds `allowedProjectIds`; if the list
  is empty it queries `.in("id", [""])` so nothing matches. Admin / accounting /
  development_lead see all.
- Project detail (`projects/[id]/page.tsx`): if role is `read_only` or
  `project_manager`, requires a `project_users` row else `redirect("/projects")`.
- `getMyRole()` (in gates/actions.ts and draws/actions.ts) returns the role or
  `null`, swallowing errors.

### Audit log
`insertAuditLog({ user_id, action, entity_type, entity_id?, project_id?, label?, payload? })`
is called after every mutation. `project_id` must be set so the admin audit UI's
project filter picks the row up (explicitly noted in `createProject`).

### Revalidation
Mutations call `revalidatePath("/projects")`, `revalidatePath(\`/projects/${id}\`)`,
and nested paths as appropriate. Clients sometimes also call `router.refresh()`.

---

## 1. PROJECTS

### Data model (fields seen)
`projects`: `id, name, code, appfolio_property_id, property_type, address, city,
state, total_units, total_sf, acquisition_date, expected_completion, status,
description, image_url, pm_user_id, pending_pm_email, lender, created_by,
created_at, updated_at`.

### Status values
`active` (default), `on_hold`, `completed`, `archived`. Filter tabs on the list
page: All / Active / On Hold / Completed / Archived, with per-status counts
(scoped to allowed projects).

### Property types (form dropdown)
`Multifamily, MHP, Commercial, Mixed-Use, Land, Other`.

### Create form fields & client behavior (`project-form.tsx`)
- **Project Name** (required), **Project Code** (required, uppercased).
  Code is auto-derived from the name until the user edits it manually:

```ts
function deriveCode(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 4)
    .map((w) => w[0].toUpperCase()).join("");
}
```
  i.e. first letter of up to the first 4 words, uppercased.
- **AppFolio Property ID** (required in the form), Property Type, Status (default
  active), Address/City/State (via `AddressAutocomplete`), Total Units, Total SF,
  Acquisition Date, Expected Completion, Project Manager (admin only),
  Lender, Notes/Description, Cover Image (file input `accept="image/*"`).
- PM dropdown: lists active `project_manager` users; for admins it also appends
  pending Clerk invites with `role==="project_manager"` as options valued
  `pending:{email}` and labeled `"{email} (Pending)"`.

### `createProject(formData)` rules (`projects/actions.ts`)
- `requirePM()`.
- Recompute code if blank using the same first-letters rule.
- **Duplicate checks** (case-insensitive name, exact code):

```ts
const [{ data: dupByName }, { data: dupByCode }] = await Promise.all([
  supabase.from("projects").select("id").ilike("name", name).maybeSingle(),
  supabase.from("projects").select("id").eq("code", code).maybeSingle(),
]);
if (dupByName) return { error: `A project named "${name}" already exists.` };
if (dupByCode) return { error: `A project with code "${code}" already exists.` };
```
- `state` is uppercased and trimmed; numeric fields coerced via `Number(...)`
  or null; `pm_user_id` parsed via `parsePmValue` (see below). `created_by=userId`.
- Insert, then **upload cover image** if present (`size > 0`) and update
  `image_url`.
- Audit `project.create`.
- **AppFolio backfill**: if `appfolio_property_id` is set, immediately run
  `runAppfolioSync({ syncType:"manual", triggeredBy:userId, propertyId })` inside
  a try/catch — a sync failure is logged but does NOT fail project creation.

`parsePmValue`:
```ts
function parsePmValue(raw) {
  const value = raw?.trim() || "";
  if (value.startsWith("pending:"))
    return { pm_user_id: null, pending_pm_email: value.slice("pending:".length) || null };
  return { pm_user_id: value || null, pending_pm_email: null };
}
```

### `updateProject(id, formData)` rules
- `requirePM()`, plus: **a `project_manager` may only edit a project they are
  assigned to**:
```ts
if (userRow?.role === "project_manager") {
  const { data: access } = await supabase.from("project_users").select("id")
    .eq("project_id", id).eq("user_id", userId).single();
  if (!access) throw new Error("You do not have permission to edit this project");
}
// accounting sees all projects (no scope restriction)
```
- Duplicate name/code checks excluding the current id (`.neq("id", id)`).
- Sets `updated_at`. Uploads a new cover image only if a new file is provided.
- Audit `project.update`.

### Image upload (Supabase Storage)
- Bucket: **`project-images`**, created public on demand (`createBucket(..., {public:true}).catch(()=>{})`).
- Path: `${projectId}/cover.${ext}` (ext from filename, default `jpg`), uploaded
  with `{ upsert: true, contentType }`.
- Returns `getPublicUrl(path).publicUrl + "?t=" + Date.now()` (cache-buster).

### Address autocomplete (`components/address-autocomplete.tsx`)
- Uses Google Maps Places `Autocomplete` if `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  is present; otherwise plain text inputs (`address`, `city`, `state` maxLength 2,
  uppercased).
- Restricted to US (`componentRestrictions: { country: "us" }`,
  `types: ["address"]`). On `place_changed`, fills street (`street_number`+`route`),
  `locality` (or `sublocality_level_1` fallback) as city, and
  `administrative_area_level_1` short_name as state.

### Map tab (`map-tab.tsx`)
- Builds `[address, city, state].filter(Boolean).join(", ")`. If empty, shows a
  placeholder. Otherwise embeds an iframe: with key →
  `https://www.google.com/maps/embed/v1/place?key=...&q=...`; without key →
  `https://maps.google.com/maps?q=...&output=embed`. Plus an "Open in Google Maps"
  link to `https://www.google.com/maps/search/?api=1&query=...`.

### `linkAppfolioId(projectId, appfolioId)`
- `requireAdmin()` (admin | accounting | development_lead). Sets
  `appfolio_property_id` (trim→null), `updated_at`. Audit `project.link_appfolio`.
  Revalidates `/admin/appfolio` and `/projects`.

### `deleteProject(id)`
- `requireStrictAdmin()` (**admin | development_lead only**). Hard
  `delete` of the project row (cascades to gates/budgets/contracts per DB FK).
  Audit `project.delete`. UI confirm requires a typed reason
  (`requireReason: true`). Delete button shown only when `isAdmin` (role==="admin"
  in project detail, which passes `isAdmin={userRole === "admin"}`).

### Edit/delete button visibility (`project-detail.tsx`, `[id]/page.tsx`)
- `canEdit = ["admin","accounting","project_manager"].includes(role)` → Edit button.
- `isAdmin = role === "admin"` → Delete button (note: detail page only flags pure
  `admin` as `isAdmin`, even though `deleteProject` would also accept
  `development_lead`).

### Project detail tabs (`project-tabs.tsx`)
Tabs: Overview, Gates(count), Contracts(count), Vendors(active count),
Documents(count), Draws(count), Map. Active tab tracked in `?tab=` query param
via `router.replace(... {scroll:false})`.

---

## 2. GATES

### Data model
`gates`: `id, project_id, name, sequence_number, status, is_locked, start_date,
end_date, notes, created_by, created_at, closed_at, closed_by`.
`gate_budgets`: `gate_id, cost_category_id, original_budget, approved_co_amount,
revised_budget, created_by, updated_at` — unique on `(gate_id, cost_category_id)`.
`revised_budget` = `original_budget + approved_co_amount` (DB-computed/maintained;
the app writes `original_budget` and `approved_co_amount`, reads `revised_budget`).

### Status machine: `pending → active → closed` (and admin reopen → active)
- **Create** → `status:"pending"`, `is_locked` default false.
- **Activate** (`activateGate`): only from `pending`:
```ts
.update({ status: "active" }).eq("id", gateId).eq("status", "pending");
```
- **Close** (`closeGate`): only from `active`, sets lock + close metadata:
```ts
.update({ status:"closed", is_locked:true, closed_at:new Date().toISOString(), closed_by:userId })
  .eq("id", gateId).eq("status", "active");
```
- **Reopen** (`reopenGate`, `requireAdmin` = admin|development_lead): only from
  `closed`, clears lock/close metadata:
```ts
.update({ status:"active", is_locked:false, closed_at:null, closed_by:null })
  .eq("id", gateId).eq("status", "closed");
```
- The status transitions use `.eq("status", <expected>)` as an optimistic guard:
  if the gate isn't in the expected state, the update silently affects 0 rows.

Note: there is no enforced **"one active gate per project"** constraint in this
code path — `activateGate` does not check for other active gates. (If such a rule
exists it would be a DB constraint/trigger, not in these files.)

### Lock semantics
- Closing locks (`is_locked=true`). Locked gates:
  - cannot have budgets edited (`upsertGateBudgets` throws "Gate is locked and
    cannot be modified");
  - cannot be replaced by Excel upload (`uploadGates` throws "...is locked and
    cannot be replaced");
  - cannot be deleted (`deleteGate` throws "Locked gates cannot be deleted");
  - hide the Edit/Delete buttons in the UI.

### sequence_number assignment
- New-gate page computes the default: `max(existing sequence_number)+1`, or 1.
- `createGate` and `updateGate` require `sequence_number >= 1` and reject
  duplicates within the project:
```ts
if (!sequenceNumber || sequenceNumber < 1) throw new Error("Gate # is required");
const { data: dup } = await supabase.from("gates").select("id")
  .eq("project_id", projectId).eq("sequence_number", sequenceNumber)
  .maybeSingle(); // updateGate also .neq("id", gateId)
if (dup) throw new Error(`Gate #${sequenceNumber} already exists for this project`);
```
- Gate name is optional. `start_date`/`end_date`/`notes` optional.

### `deleteGate` — `requireAdmin` (admin | development_lead), refuses locked gates.

### Budget editing (`upsertGateBudgets` + `BudgetTable` in gate-detail.tsx)
- Only when not locked. Upserts rows on conflict `gate_id,cost_category_id`,
  writing only `original_budget` (+ `created_by`, `updated_at`). `approved_co_amount`
  is never touched here (it's driven by approved COs).
- BudgetTable computes per-row and totals client-side:
  - `revised = original_budget + approved_co_amount`
  - `variance = revised - actual_amount`
  - groups rows by `category_header` (the cost category's `description` field).
- **Actuals**: gate detail page (`gates/[gateId]/page.tsx`) computes per-category
  actuals from `appfolio_transactions` if the project has an
  `appfolio_property_id`, by matching `gl_account_id` (trim+upper) to cost
  category `code` (trim+upper), within the gate's `[start_date, end_date]` window
  (`bill_date` gte/lte). Sums `invoice_amount`.

### Budget Excel upload (`upload-gates-modal.tsx` + `uploadGates`)
Two accepted layouts, auto-detected:
- **Horizontal**: header row with columns `Gate Name`, `Sequence`/`Gate #`,
  `Start Date`, `End Date`, `Notes`, then one column per cost code header
  formatted `"<code> - <name>"` (code extracted via regex
  `/^\s*([^\s-][^-]*?)\s*[-–—]\s*.+$/`, falling back to whole header).
  Each subsequent row is one gate.
- **Vertical (transposed)**: detected when cell A1 == `"field"` (case-insensitive).
  Column A holds field labels, each column B+ is a gate. This is the format the
  downloadable template produces.

Date normalization handles Excel serial numbers (`XLSX.SSF.parse_date_code`),
`YYYY-MM-DD`, and `MM/DD/YYYY` → `YYYY-MM-DD`. Non-numeric budget cells become 0
with a warning. Missing/blank sequence numbers auto-increment from a running
counter.

Client classifies each row by sequence vs existing gates: `new`, `replace`
(unlocked existing), or `locked` (existing & locked → skipped, never sent).

`uploadGates(projectId, rows)` server logic:
- `requirePM()`. Loads active `cost_categories`, maps `code (trim+upper) → id`.
- Loads existing gates with `is_locked` into a `sequence_number → gate` map.
- For each row:
  - If an existing gate matches the sequence and **is locked** → throws
    `Gate #N "name" is locked and cannot be replaced`.
  - If existing (unlocked): update name/dates/notes, then **upsert budgets**
    (only `original_budget`; `approved_co_amount` untouched) on conflict
    `gate_id,cost_category_id`. `updated++`.
  - Else insert new gate (`status:"pending"`) + insert budget rows. `created++`.
  - Unknown column codes are collected into `unknownCodeSet` and **skipped**
    (their budget is effectively 0); reported back as `unknownCodes`.
- Audit `gate.upload_bulk` with `{created, updated, gate_count}`. Revalidates
  project + each processed gate detail page.
- Return shape: `{ created, updated, unknownCodes? }`. If `unknownCodes` present,
  the modal stays open to warn (gates/budgets WERE saved).

### Budget-upload xlsx template (`api/projects/[id]/gates/template/route.ts`)
- Clerk `auth()` required. Produces a **vertical** workbook:
  - Sheet "Gates": col A header `Field`, cols B..E `Gate 1..Gate 4`
    (`SAMPLE_GATE_COLUMNS = 4`). Fixed rows: `Gate Name, Sequence, Start Date,
    End Date, Notes` (with a sample in Gate 1), then one row per active cost
    category labeled `"<code> - <name>"` defaulting amount 0.
  - Freezes col A + header row (`!views` frozen split).
  - Sheet "Instructions" documenting required/optional fields and the
    `"<code> - <name>"` cost-category row convention.
  - Filename `gates-template-<project.code or id>.xlsx`.

### Gate-level (budget) change orders
See §4 — created from the gate detail page with `contract_id = null`.

---

## 3. CONTRACTS & SCHEDULE OF VALUES (SOV)

### Data model
`contracts`: `id, project_id, gate_id, cost_category_id, vendor_name,
contract_number, description, original_value, approved_co_amount, revised_value,
retainage_pct, execution_date, substantial_completion_date, status, teams_url,
notes, created_by, created_at, updated_at`.
- `revised_value` = `original_value + approved_co_amount` (DB maintained; app reads).
- `gate_id` stores the **primary** (first selected) gate; the full many-to-many
  set lives in `contract_gates (contract_id, gate_id)`.
`contract_line_items` (the SOV): `id, contract_id, cost_category_id, description,
amount, created_at, updated_at`.

### Contract status values
`active` (default), `complete`, `terminated`.

### Create form (`new-contract-form.tsx`) fields
- Vendor (required, datalist of active project vendors), Contract # (optional),
  Status (default active), Description (required), **Gates** (checkbox list,
  ≥1 required), **Total Contract Value** `original_value` (required),
  Retainage % (0–100, default 0), Execution Date, Substantial Completion Date.
- **AI extraction**: an "Upload Contract" button POSTs the file to
  `/api/extract-contract` and auto-fills vendor/number/description/value/retainage/dates.

### SOV — sum must equal contract value (client validation)
The SOV is **always required** (≥1 line, each with a cost category). The form
blocks submit unless the SOV total balances to the contract value within 1¢:

```ts
const totalValue = parseFloat(originalValue) || 0;
const sovTotal = sovLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
const sovDiff = totalValue - sovTotal;
const sovBalanced = totalValue > 0 && Math.abs(sovDiff) < 0.01;
...
if (sovLines.some((l) => !l.cost_category_id))
  setError("Select a cost category for every Schedule of Values line.");
if (!sovBalanced)
  setError(`Schedule of Values total (${fmtCurrency(sovTotal)}) must equal the Total Contract Value (${fmtCurrency(totalValue)})`);
```
SOV lines are serialized to a hidden `sov_lines` JSON field
(`[{cost_category_id, description|null, amount}]`).

### `createContract(projectId, formData)` server rules (`contracts/actions.ts`)
- `requirePM()`.
- `gate_ids` (multi) required ≥1. `sov_lines` JSON required, ≥1 line, first
  line must have a `cost_category_id`:
```ts
const gateIds = formData.getAll("gate_ids") as string[];
if (!gateIds.length) throw new Error("At least one gate must be selected");
const sovRaw = formData.get("sov_lines");
if (!sovRaw) throw new Error("Schedule of Values is required");
const sovLines = JSON.parse(sovRaw);
if (!sovLines.length) throw new Error("At least one Schedule of Values line is required");
if (!sovLines[0].cost_category_id) throw new Error("Each Schedule of Values line must have a cost category");
```
- Insert contract with `gate_id = gateIds[0]`, `cost_category_id =
  sovLines[0].cost_category_id`, parsed `original_value`/`retainage_pct`.
- Insert `contract_gates` rows for all gateIds; insert `contract_line_items`.
- NOTE: the server does **not** re-validate the SOV-sum balance (the balance rule
  is client-only). Server enforces "≥1 line, first has a category" only.
- Audit `contract.create`.

### `updateContract(contractId, projectId, formData)`
- `requirePM()`, ≥1 gate. Updates contract fields + `updated_at`. Replaces
  `contract_gates` (delete all then insert). Does NOT touch line items here
  (SOV edited separately). Audit `contract.update`.

### `deleteContract` — `requireAdmin` (admin | development_lead)
Deletes child `change_orders`, `contract_gates`, `contract_line_items`, then the
contract. Audit `contract.delete`.

### SOV line CRUD (`addContractLineItem`/`updateContractLineItem`/`deleteContractLineItem`)
- `requirePM()`. After any change, **`syncContractCostCategory`** sets the
  contract's top-level `cost_category_id` to the **earliest** line item's category:
```ts
const { data: lines } = await supabase.from("contract_line_items")
  .select("cost_category_id, created_at").eq("contract_id", contractId)
  .order("created_at", { ascending: true }).limit(1);
if (lines?.length) await supabase.from("contracts")
  .update({ cost_category_id: lines[0].cost_category_id, updated_at: ... })
  .eq("id", contractId);
```
- Contract-detail SOV editing has no hard sum lock; it shows an amber
  "unallocated / over contract" banner when `Math.abs(originalValue - sovTotal) >= 0.01`.

### How SOV feeds the PCM report column G (Total Committed)
Documented in the UI InfoTips (load-bearing for rebuild):
- If a contract has SOV line items, **PCM column G splits the contract's value
  across those cost codes** (per line). If no line items exist, the full contract
  value is attributed to the contract's single top-level `cost_category_id`.
- Approved change orders are added on top, per their own cost code/gate.
(The PCM computation itself lives in the reports module — out of scope here — but
the contributing rule is: committed = contract original allocated by SOV +
approved COs by category.)

---

## 4. CHANGE ORDERS

### Data model
`change_orders`: `id, contract_id (nullable), project_id, gate_id,
cost_category_id, co_number, description, amount, status, proposed_date,
approved_date, approved_by, rejection_reason, teams_url, notes, created_by,
created_at, updated_at`.

### Status machine
`proposed → approved | rejected`; `approved → voided`. (No transition out of
rejected/voided.)
- New COs are always `status:"proposed"`.
- **Editable only while `proposed`** (`updateChangeOrder` uses
  `.eq("status","proposed")` guard; comment: "only editable while proposed").
- **Deletable only while `proposed`** (`deleteChangeOrder`, admin only,
  `.eq("status","proposed")`).
- **Reject** only from proposed (`.in("status",["proposed"])`); stores
  `rejection_reason` (trim→null).
- **Approve**: sets `status:"approved"`, `approved_date` (today, `YYYY-MM-DD`),
  `approved_by=userId`, `updated_at`. Then recalculates roll-ups (below).
- **Void**: from approved (no status guard in the update, but UI only offers Void
  on approved rows); sets `status:"voided"`, recalculates roll-ups.

### CO number auto-generation (CO-001, CO-002, …)
Project-scoped, count-based, zero-padded to 3; user may override:
```ts
async function nextCoNumber(supabase, projectId) {
  const { count } = await supabase.from("change_orders")
    .select("id", { count: "exact", head: true }).eq("project_id", projectId);
  return `CO-${String((count ?? 0) + 1).padStart(3, "0")}`;
}
```
Used by both `createChangeOrder` and `createBudgetChangeOrder` when `co_number`
is blank. (Because it is count-based, deleting/voiding can theoretically produce a
collision — there is no uniqueness enforcement in app code.)

### Two flavors of CO and their differing impacts
1. **Contract-level CO** (`createChangeOrder(contractId, projectId, costCategoryId, formData)`)
   - Requires `gate_id`. `cost_category_id` passed in = the contract's category.
   - On approve/void, **both** roll-ups recalc:
     - `recalcContractCoTotal(contractId)` → `contracts.approved_co_amount` =
       sum of approved COs for that contract (which feeds `revised_value`).
     - `recalcGateBudgetCoTotal(gate_id, cost_category_id)` → that gate_budget
       row's `approved_co_amount`.
2. **Budget-level CO** (`createBudgetChangeOrder(projectId, gateId, formData)`)
   - `contract_id = null`. Requires `cost_category_id` (chosen in form).
   - Entry point: gate detail page ("+ Add Budget CO"). Used for owner budget
     adjustments not tied to a vendor contract.
   - On approve/void, only `recalcGateBudgetCoTotal(gate_id, cost_category_id)`
     runs (no contract roll-up). So it adjusts the **gate budget** column only.

### Roll-up recalcs (exact code)
```ts
async function recalcContractCoTotal(supabase, contractId) {
  const { data } = await supabase.from("change_orders").select("amount")
    .eq("contract_id", contractId).eq("status", "approved");
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  await supabase.from("contracts")
    .update({ approved_co_amount: total, updated_at: ... }).eq("id", contractId);
}
async function recalcGateBudgetCoTotal(supabase, gateId, costCategoryId) {
  const { data } = await supabase.from("change_orders").select("amount")
    .eq("gate_id", gateId).eq("cost_category_id", costCategoryId).eq("status","approved");
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  await supabase.from("gate_budgets")
    .update({ approved_co_amount: total, updated_at: ... })
    .eq("gate_id", gateId).eq("cost_category_id", costCategoryId);
}
```
Both sum **only approved** COs, so approving adds and voiding/rejecting removes
the amount from the relevant total. In `approveChangeOrder`/`voidChangeOrder`,
`resolvedContractId = contractId ?? co.contract_id ?? null` — the contract recalc
only runs when a contract is tied.

### Fields that lock by status (UI)
- `proposed`: Approve / Reject / Edit buttons; Delete (admin only). Editable
  fields: gate, cost_category, co_number, description, amount, proposed_date,
  teams_url, notes.
- `approved`: only "Void" offered; shows `approved_date`.
- `rejected`: read-only; shows `rejection_reason` in red.
- `voided`: read-only (gray, strike-through badge on gate view).

Rejection reason captured via a modal (`RejectModal` on contract detail;
`GateCORejectModal` on gate detail), passed as optional 4th arg to
`rejectChangeOrder(coId, contractId|null, projectId, rejectionReason?)`.

CO badge color maps differ slightly between contract view (`proposed` = yellow)
and gate view (`proposed` = amber, `voided` = line-through) but mean the same.

---

## 5. DRAWS (Draw Requests)

### Data model
`draw_requests`: `id, project_id, draw_number, title, submission_date, status,
lender, notes, created_by, created_at, updated_at`.
`draw_request_lines`: `(draw_request_id, cost_category_id, this_draw_amount,
notes, updated_at)` — unique on `(draw_request_id, cost_category_id)`.

### Draw number sequence (`createDrawRequest`)
- `requirePM()`. `submission_date` required.
- Auto-assigns `draw_number = max(existing for project) + 1`, else 1:
```ts
const { data: existing } = await supabase.from("draw_requests")
  .select("draw_number").eq("project_id", projectId)
  .order("draw_number", { ascending: false }).limit(1);
const drawNumber = existing && existing.length > 0 ? existing[0].draw_number + 1 : 1;
```
- `lender` defaults to the form value or the project's `lender`.
- `status:"draft"`. Audit `draw_request.create`. Returns `{ id }`; UI navigates to
  the new draw detail page.

### Status workflow
`draft → submitted`; `submitted → approved | rejected`; `approved → draft`
(revert); `rejected → draft` (revert). Transition map (client):
```ts
const STATUS_TRANSITIONS = {
  draft:     [{ label: "Mark Submitted", next: "submitted" }],
  submitted: [{ label: "Mark Approved", next: "approved" }, { label: "Mark Rejected", next: "rejected" }],
  approved:  [{ label: "Revert to Draft", next: "draft" }],
  rejected:  [{ label: "Revert to Draft", next: "draft" }],
};
```
- `updateDrawStatus(drawId, projectId, status)` (`requirePM`) does a plain update
  with `updated_at` — no server-side state guard, so the UI is the gate.

### Edit-Amounts behavior (`draw-detail.tsx` + `upsertDrawLines`)
- Header edit (`updateDrawRequest`) and line "Edit Amounts" are only shown while
  `status === "draft"` (and `canEdit`).
- "Edit Amounts" reveals number inputs per cost category. On Save, every
  category is read from refs, parsed (`parseFloat(raw.replace(/[^0-9.-]/g,""))`),
  and only lines where `this_draw_amount !== 0` **or** an existing line had a
  non-zero amount are upserted (so zeroing an existing line persists the 0):
```ts
.filter((l) => l.this_draw_amount !== 0 ||
  (lineMap.get(l.cost_category_id)?.this_draw_amount ?? 0) !== 0);
```
- `upsertDrawLines` upserts on conflict `draw_request_id,cost_category_id` with
  `this_draw_amount`, `notes`, `updated_at`. Audit `draw_request.lines`.

### The draw math (exact formulas — identical in detail view and Excel export)
Per cost category:
- **Total Budget** = sum of `gate_budgets.revised_budget` for that category across
  **all gates in the project** (joined `gates!inner(project_id)`).
- **Previously Drawn** = sum of `this_draw_amount` for that category across **all
  other draws for the project** (excluding the current draw — no status filter; a
  comment in the page says "approved/submitted" but the code sums *all* other
  draws regardless of status):
```ts
for (const pd of previousDraws) {
  if (pd.id === draw.id) continue;
  for (const pl of pd.lines)
    prevDrawnMap.set(pl.cost_category_id, (prevDrawnMap.get(pl.cost_category_id) ?? 0) + pl.this_draw_amount);
}
```
- **This Draw** = current draw's `this_draw_amount` for the category.
- **Balance Remaining** = `Total Budget − Previously Drawn − This Draw`.
- Totals row sums each column; `totalBalance = totalBudget − totalPrevDrawn − totalThisDraw`.
- A negative balance renders in the destructive (red) color.

### Excel export (`api/draws/[drawId]/export/route.ts`)
- Clerk `auth()` required. Same budget/prev-drawn math as above.
- Skips categories where budget, prevDrawn, and thisDraw are all 0.
- Columns: **Code, Cost Category, Total Budget, Previously Drawn, This Draw,
  Balance Remaining**. Header block rows: project name, `Draw Request #N — title`,
  `Submission Date: <Month D, YYYY>`, optional `Lender:`, blank, then header row;
  a `TOTAL` row; optional `Notes:` row.
- Currency columns (C–F) formatted `"$"#,##0.00_);[Red]("$"#,##0.00)`. Column
  widths set. Filename `Draw-<n>[-<sanitized title>].xlsx`.

### Delete draw (`deleteDrawRequest`) — `requirePM()` (not admin-restricted),
hard delete. UI shows a Delete link on each row (canEdit) with a destructive
confirm.

---

## 6. TRANSACTION CATEGORIZATION / GATE / NOTES (overrides)

These operate on AppFolio-synced rows and survive future syncs because overrides
live in dedicated `*_override` columns / side tables. Edit permission for all
three = `admin | project_manager | accounting | development_lead`.

### Cost category override (`app/actions/transaction-category.ts`)
`updateTransactionCostCategory(transactionId, categoryId)`:
- Looks up the category's `code`/`name`, then updates `appfolio_transactions` with
  **both** the effective columns and the override columns:
```ts
.update({
  cost_category_code: cat.code,
  cost_category_name: cat.name,
  cost_category_code_override: cat.code,
  cost_category_name_override: cat.name,
  cost_category_override_by: userId,
  cost_category_override_at: nowIso,
})
```
- Returns `{ categoryCode, categoryName }`. Revalidates
  `/reports/cost-detail` and `/reports/cost-management`.
- `clearTransactionCostCategoryOverride(transactionId)` nulls the four override
  columns (leaving the synced effective code/name from AppFolio in place).
- UI cell (`transaction-category-cell.tsx`): shows code + name; a blue dot marks
  `isOverride` ("Manually overridden — survives AppFolio sync"); unmatched shows
  "— Unmatched —". Pencil opens a category `<select>`; save sets override=true.

### Gate override (`app/actions/transaction-gate.ts`)
`updateTransactionGate(transactionId, gateId)`: upserts into
`transaction_gate_assignments` (separate table, unique on
`appfolio_transaction_id`) with `is_override:true, assigned_by, assigned_at`:
```ts
.upsert({ appfolio_transaction_id: transactionId, gate_id: gateId,
  is_override: true, assigned_by: userId, assigned_at: ... },
  { onConflict: "appfolio_transaction_id" });
```
- UI cell (`transaction-gate-cell.tsx`): `<select>` of project gates
  (`Gate N — name`); blue dot when `isOverride`.

### Notes (`app/actions/transaction-notes.ts`)
Keyed by **`appfolio_bill_id`** (not the transaction row id) so a note attaches to
the bill across syncs. Any authenticated user can write (only auth check):
- `upsertTransactionNote(appfolioBillId, note)` → upsert into `transaction_notes`
  on conflict `appfolio_bill_id` with trimmed note, `updated_by/at`, `created_by`.
- `deleteTransactionNote(appfolioBillId)`.
- UI cell (`transaction-note-cell.tsx`): textarea; Cmd/Ctrl+Enter saves, Esc
  cancels; clearing the text deletes the note; delete button shown only to
  `isAdmin`.

### Unmatched cost modal (`components/unmatched-cost-modal.tsx`)
Read-only drill-down: a clickable code label opens a modal listing the AppFolio
transactions whose cost category code is not defined in the app. Shows bill date,
vendor, description, paid/unpaid, status, check #, reference; totals paid/unpaid.
Footer instructs to add/rename a cost category in Settings → Cost Categories to
reclassify.

### Expandable card (`components/expandable-card.tsx`)
Generic dashboard helper: `ExpandButton` (opens) + `ExpandedModal` (centered
overlay, closes on Esc/backdrop, locks body scroll). No business rules.

---

## 7. VENDORS

### Per-project vendor directory
`project_vendors`: `id, project_id, name, is_active, notes, created_by,
created_at`. Unique on `(project_id, name)` (the actions translate Postgres
`23505` into `"<name>" already exists for this project`).

Populated automatically from AppFolio syncs and contract entries; also manually.
Active vendors feed the contract form's vendor autocomplete `datalist`; inactive
are hidden from autocomplete.

Actions (`projects/[id]/vendors/actions.ts`):
- `addProjectVendor(projectId, name)` — `requirePM`; trim; insert
  `{is_active:true, created_by}`; dup → friendly error.
- `setVendorActive(vendorId, projectId, isActive)` — `requirePM`; toggle.
- `renameProjectVendor(vendorId, projectId, newName)` — `requirePM`; trim; dup
  handling.
- `deleteProjectVendor(vendorId, projectId)` — `requireAdmin` (admin |
  development_lead); hard delete.

UI: project tab (`vendors-section.tsx`) inline add + search + active/inactive/all
filter; full page (`vendors/page.tsx` + `vendor-table.tsx`) adds rename/toggle
(canEdit) and delete (isAdmin). `canEdit = admin|project_manager|development_lead`;
`isAdmin = admin|development_lead`. read_only users must be assigned (else
redirect).

### Cross-project vendor profile (`/vendors`, `/vendors/[name]`)
- `/vendors` (directory): groups `project_vendors` by `name` across all projects;
  shows project count + Active (if active in any project) / Inactive; scoped for
  non-admins to assigned projects. Search via `?q=`.
- `/vendors/[name]` (profile): aggregates across the vendor's projects:
  - Summary cards from `appfolio_transactions` matched by `ilike vendor_name` over
    the vendor's projects' `appfolio_property_id`s: Total Invoiced, Total Paid,
    Unpaid, Transaction count; per-project breakdown; 10 most recent transactions.
  - **Compliance alerts**: COIs are flagged Expired (`expiration_date < now`) and
    Expiring Soon (within 60 days).
  - `renameVendor(oldName, newName)` (`vendors/[name]/actions.ts`, `requirePM`)
    renames across all `project_vendors` via `ilike("name", oldName)`; UI then
    redirects to the new name's URL.

### Vendor compliance documents (`vendor_documents`)
Columns: `id, vendor_name, project_id(nullable scope), document_type,
display_name, storage_path, insurer_name, policy_number, coverage_type,
per_occurrence_limit, aggregate_limit, additional_insured, waiver_of_subrogation,
waiver_type, waiver_amount, through_date, effective_date, expiration_date, notes,
created_by, created_at`.
- Document types: **COI**, **Lien Waiver**, **Other**. Type-specific fields:
  - COI: insurer, policy #, coverage type (from a fixed list), per-occurrence &
    aggregate limits, effective/expiration dates, `additional_insured` &
    `waiver_of_subrogation` checkboxes (only persisted when type==="COI", else null).
  - Lien Waiver: waiver type (Conditional/Unconditional × Partial/Final),
    amount, through date, effective date.
  - Other: effective/expiration dates only.
- **AI extraction** for COI PDFs/images via `/api/extract-document` pre-fills fields.
- Storage: bucket **`project-documents`**, path
  `vendors/<safeVendor>/<timestamp>-<safeFile>` (chars outside `[a-zA-Z0-9._-]`
  → `_`). 50 MB cap. DB insert rolls back the storage upload on failure.
- `uploadVendorDocument` / `updateVendorDocument` = `requirePM`; download via
  `getVendorDocumentSignedUrl` (1-hour signed URL); `deleteVendorDocument` =
  `requireAdmin` (admin | development_lead).

---

## 8. PROJECT DOCUMENTS (`projects/[id]/documents`)

`project_documents`: `id, project_id, name, url (storage path), category, notes,
created_by, created_at`.
- Categories (UI fixed list): **Legal, Financial, Design, Other**.
- Storage bucket **`project-documents`** (private), created on demand with
  `fileSizeLimit: 52428800` (50 MB) and an explicit `allowedMimeTypes` list
  (PDF, Word, Excel, PowerPoint, common images, txt, csv, zip).
- `uploadDocument` (`requirePM`): rejects empty file / >50 MB; stores at
  `${projectId}/${Date.now()}-${safeName}` (`upsert:false`); inserts the DB row
  with `url = storagePath`; rolls back the storage object if the DB insert fails.
- `getSignedDownloadUrl(storagePath)`: 1-hour signed URL (any authenticated call;
  uses `createAdminClient` directly, no role check).
- `updateDocumentMeta` (`requirePM`): edit name/category/notes.
- `deleteDocument` (`requireAdmin` = admin | development_lead): removes the
  storage object then the DB row.
- UI (`document-list.tsx`): upload form (canEdit), category filter chips, search,
  per-row Download / Edit (canEdit) / Delete (isAdmin). `canEdit =
  admin|project_manager|development_lead`; `isAdmin = admin|development_lead`.
  read_only must be assigned to the project (else redirect).

---

## Summary (workflows covered)

1. **Projects**: PM-gated create/edit with auto-code derivation, dup name/code
   checks, Supabase `project-images` cover upload, Google Maps address
   autocomplete + map embed, AppFolio backfill on create, `project_users` access
   scoping, and strict-admin-only delete.
2. **Gates & budgets**: pending→active→closed(+admin reopen) state machine with
   lock-on-close, per-project unique sequence numbers, category budgets editable
   while unlocked, AppFolio actuals by GL/date-window, and dual-layout xlsx budget
   upload with a generated template.
3. **Contracts / SOV & Change Orders**: contracts require ≥1 gate and a balanced
   Schedule of Values (client-enforced); SOV drives PCM column G; COs run a
   proposed→approved/rejected→voided machine with `CO-00n` auto-numbering and
   approved-only roll-ups into contract.approved_co_amount and
   gate_budgets.approved_co_amount (budget-only COs skip the contract roll-up).
4. **Draws, transaction overrides & vendors/docs**: auto-numbered draw requests
   with a draft/submitted/approved/rejected flow and Budget−PrevDrawn−ThisDraw
   math (mirrored in the Excel export); sync-surviving cost-category/gate/note
   overrides via `*_override` columns + side tables; and project + cross-project
   vendor directories with COI/Lien-Waiver compliance documents and private
   1-hour-signed-URL document storage.


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/04-admin-auth.md -->
<!-- ============================================================ -->

# KILN — Admin / Auth / Monitoring Surfaces (Rebuild Spec)

This document is a rebuild-grade reference for the **admin**, **authentication**, and
**monitoring** surfaces of KILN (Next.js 14 App Router / RSC, Clerk auth, Supabase
Postgres). It is written so the surfaces can be reconstructed from this document alone.

Stack facts that the rest of this doc depends on:

- **Auth**: Clerk. The authenticated Clerk user id is made available to server
  components / route handlers via a request header **`x-clerk-user-id`** (set by
  middleware — not documented here, but every page/route reads it with
  `(await headers()).get("x-clerk-user-id")`).
- **DB access**: `@/lib/supabase/server` exports two clients:
  - `createClient()` — RLS-scoped client using the Clerk-signed Supabase JWT (`supabase` JWT template). Used in normal user flows.
  - **`createAdminClient()`** — service-role client that **bypasses RLS**. Used by **every** admin page, every admin server action, and every admin/webhook route in this document. Built as:
    ```ts
    export function createAdminClient() {
      const { createClient } = require("@supabase/supabase-js");
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
    ```
- Every admin page declares `export const dynamic = "force-dynamic";`.
- The user's app-role lives in the Supabase **`users`** table (`role` column) AND is mirrored into Clerk **`public_metadata.role`** (so invites and the webhook can read it before a DB row exists).

---

## 1. Roles & Permissions

### 1.1 The role set

There are exactly **five** roles. The canonical TypeScript union (from
`app/(dashboard)/admin/actions.ts` and `role-select.tsx`) is:

```ts
type Role = "admin" | "project_manager" | "read_only" | "accounting" | "development_lead";
```

The DB enforces this with a CHECK constraint (see migration SQL in §8):

```sql
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'project_manager', 'read_only', 'accounting', 'development_lead'));
```

Display labels (`role-select.tsx`):

| Role | Label |
|------|-------|
| `admin` | Admin |
| `accounting` | Accounting |
| `development_lead` | Development Lead |
| `project_manager` | Project Manager |
| `read_only` | Read Only |

`admin` and `development_lead` are treated as **"all projects"** users throughout the UI
(they are never assigned to individual projects; project pickers exclude them).

### 1.2 Server-side gating pattern (this is the security model)

There is **no shared role-guard middleware** for admin pages. Each admin page/route
re-checks the role itself, reading the role from the `users` table via the
service-role client. The universal pattern at the top of every admin RSC page:

```ts
const userId = (await headers()).get("x-clerk-user-id");
const supabase = createAdminClient();
const { data: user } = await supabase
  .from("users").select("role").eq("id", userId!).single();
if (/* role not allowed */) redirect("/dashboard");
```

Server actions and API routes use the same idea but **throw / return an error**
instead of redirecting.

### 1.3 Per-surface role matrix (the exact checks, copied from source)

| Surface | File | Allowed roles | On failure |
|---|---|---|---|
| Admin index (`/admin`) | `admin/page.tsx` | `admin`, `accounting`, `development_lead` | `redirect("/dashboard")` |
| Admin index — "Users & Access" card | `admin/page.tsx` | hidden for `accounting` (card filtered out) | — |
| Users & Access page (`/admin/users`) | `admin/users/page.tsx` | `admin`, `development_lead` | `redirect("/dashboard")` |
| User-management server actions | `admin/actions.ts` `requireAdminCaller()` | `admin`, `development_lead` | `throw new Error("Unauthorized")` |
| Cost Categories page (`/admin/cost-categories`) | `cost-categories/page.tsx` | `admin`, `accounting`, `development_lead` | `redirect("/dashboard")` |
| Cost-category server actions | `cost-categories/actions.ts` `requireAdmin()` | `admin`, `accounting`, `development_lead` | `throw new Error("Unauthorized")` |
| AppFolio page (`/admin/appfolio`) | `appfolio/page.tsx` | `admin`, `accounting`, `development_lead` | `redirect("/dashboard")` |
| Audit Log page (`/admin/audit-log`) | `audit-log/page.tsx` | `admin`, `accounting`, `development_lead` | `redirect("/dashboard")` |
| Monitoring index (`/admin/monitoring`) | `monitoring/page.tsx` | **`admin` only** | `redirect("/dashboard")` |
| Chat Log / User Activity / AI Usage | `monitoring/**/page.tsx` | **`admin` only** | `redirect("/dashboard")` |
| `POST /api/admin/apply-migrations` | route | `admin`, `development_lead` | 401 (no user) / 403 |
| `POST /api/admin/assign-gates` | route | `admin`, `accounting`, `development_lead` | 401 / 403 |
| `POST /api/activity` | route | any authenticated user | 401 if no `x-clerk-user-id` |

Key takeaways:
- **Monitoring is the most restricted** — `admin` only (chat content + cost data).
- **Accounting** can see everything except user management (it can't invite/role/activate users, and the Users card is hidden from the admin index). It *can* run AppFolio sync, gate assignment, cost categories, and read the audit log.
- **development_lead** has admin-equivalent power for user management, categories, AppFolio, migrations — but **not** monitoring.

The DB also has RLS helper functions referenced in migration SQL: `get_my_role()`,
`is_admin()`, and direct `users.role` lookups via `auth.jwt() ->> 'sub'`. These back
the RLS policies for the monitoring + gate-assignment tables (see §8).

---

## 2. Users & Access

Two route surfaces share one big client component:

- `app/(dashboard)/admin/users/page.tsx` — RSC that loads data and gates on
  `admin`/`development_lead`, then renders `<UsersSection>`.
- `app/(dashboard)/admin/users-section.tsx` — the entire interactive UI.

### 2.1 Data loaded by `/admin/users` page

```ts
const [{ data: users }, { data: projects }, { data: projectUsers }, { invites: pendingInvites }] =
  await Promise.all([
    supabase.from("users").select("id, email, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("projects").select("id, name, code").order("name"),
    supabase.from("project_users").select("project_id, user_id"),
    getPendingInvites(),  // server action, see §2.4
  ]);
```

Props passed to `<UsersSection>`: `users`, `currentUserId` (the Clerk id from the
header), `pendingInvites`, `projects`, `assignments` (= `project_users` rows).

### 2.2 Tables involved

- **`users`**: `id` (Clerk user id, TEXT), `email`, `full_name`, `role`, `is_active`, `created_at`, `updated_at`, `last_login_at`.
- **`project_users`**: join table — `user_id`, `project_id`, `assigned_by`.
- **`pending_project_assignments`**: pre-acceptance project assignments keyed by email — `invite_email`, `project_id`, `assigned_by`. Unique on `(invite_email, project_id)`.

### 2.3 Invite flow (`inviteUser` in `admin/actions.ts`)

Caller must be `admin`/`development_lead` (`requireAdminCaller()`). Requires
`NEXT_PUBLIC_APP_URL` env or it throws. Logic:

```ts
const clerk = await clerkClient();
await clerk.invitations.createInvitation({
  emailAddress: email,
  publicMetadata: { role },                 // role rides on the Clerk invite
  redirectUrl: `${appUrl}/sign-up`,
  ignoreExisting: false,
});
// Store project assignments now, before the user exists:
if (projectIds.length > 0) {
  await supabase.from("pending_project_assignments").insert(
    projectIds.map((projectId) => ({ invite_email: email, project_id: projectId, assigned_by: callerId }))
  );
}
```

Error handling: a message containing `"already been invited"` or `"duplicate"` is
collapsed to `"An invitation has already been sent to that address."`.

The invite form (`invite-user-form.tsx`) lets the admin pick a role and (for
non-admin/accounting/development_lead roles only) pre-select project chips. For
`admin`/`accounting`/`development_lead`, the project picker is hidden and
`projectIds` is forced to `[]`:

```ts
const projectIds = role === "admin" || role === "accounting" || role === "development_lead" ? [] : selectedProjectIds;
```

### 2.4 Listing pending invites (`getPendingInvites`)

Reads from **Clerk** (`clerk.invitations.getInvitationList({ status: "pending" })`)
and joins against `pending_project_assignments` (DB) by email to attach `projectIds`.
Role falls back to `"read_only"` if missing from invite metadata. Returns
`{ id, emailAddress, role, projectIds, createdAt, status }[]`.

### 2.5 Revoke invite (`revokeInvite`)

`clerk.invitations.revokeInvitation(inviteId)` then deletes all
`pending_project_assignments` for that email. UI confirms via a destructive-confirm
dialog (`useConfirmDestructive`).

### 2.6 Provisioning — how invites become `users` rows (Clerk webhook)

> Full webhook is documented elsewhere; summary here because it completes the invite loop.
> File: `app/api/webhooks/clerk/route.ts` (Svix-verified with `CLERK_WEBHOOK_SECRET`).

- **`user.created`**: reads `public_metadata.role`. `role = invitedRole ?? "read_only"`;
  `is_active = Boolean(invitedRole)` — i.e. **invited users start active, direct/self-signups start inactive read_only**. Inserts into `users`. If invited, it then merges `pending_project_assignments` (by email) + any legacy `public_metadata.projectIds`, inserts rows into `project_users`, and deletes the consumed pending rows.
- **`user.updated`**: updates email/full_name/role on an existing `users` row only (never creates — preserves the invite gate).
- **`session.created`**: sets `last_login_at` and writes an `audit_logs` row `{ action: "user.login", entity_type: "user", label: "Signed in" }`.
- **`user.deleted`**: soft-delete → `is_active = false`.

### 2.7 Sync-from-Clerk (`syncClerkUsers`)

Backfill for users created directly in Clerk. Pages Clerk's user list
(`getUserList`, PAGE_SIZE=100), inserts any whose id is not already in `users`. Same
role/`is_active` derivation as the webhook (`invitedRole ?? "read_only"`,
`is_active = Boolean(invitedRole)`). Returns `{ created }`. Surfaced in
`users-section.tsx` via the "Sync from Clerk" button.

### 2.8 Role change (`updateUserRole` + `role-select.tsx`)

- Cannot change your own role: `if (targetUserId === callerId) return { error: "You cannot change your own role" };`
- Updates `users.role`, then mirrors to Clerk: `clerk.users.updateUser(targetUserId, { publicMetadata: { role: newRole } })`.
- If the DB update fails with `users_role_check`, returns a friendly message telling the admin to run the migration (Admin → AppFolio → Apply Pending Migrations) including the literal ALTER TABLE SQL.
- `role-select.tsx`: a `<select>` of all 5 roles; renders a static "(you)" badge if `isSelf`.

### 2.9 Activate / deactivate (`toggleUserActive` + `active-toggle.tsx`)

- Cannot deactivate yourself: `if (targetUserId === callerId) return { error: "You cannot deactivate your own account" };`
- Reads current `is_active`, writes the negation.
- `active-toggle.tsx`: if `isSelf`, renders a static green "Active" badge (no button). Otherwise a toggle button — green "Active" (hover → red) / muted "Inactive" (hover → green).

### 2.10 Project assignment

Server actions (all in `admin/actions.ts`):
- `assignUserToProject(userId, projectId)` → insert into `project_users` with `assigned_by = callerId`.
- `removeUserFromProject(userId, projectId)` → delete matching `project_users` row.
- `assignPendingInviteToProject(email, projectId)` → upsert into `pending_project_assignments` (`onConflict: "invite_email,project_id"`).
- `removePendingInviteFromProject(email, projectId)` → delete matching pending row.

Two UIs drive these:
1. **`users-section.tsx` → `UserProjectCell`** (inline per-user chips in the users table). For `admin`/`development_lead` it shows "All projects (Admin/Development Lead)" and offers no picker. Otherwise shows assigned project chips with `×` remove and a "+ Project" inline picker.
2. **`project-access.tsx` → `ProjectAccessSection`** (project-centric accordion). Each project row expands to a panel listing assigned active users + pending invites (amber styling), with an "Add a user" `<select>` whose option values are `user:<userId>` or `invite:<email>` — the handler dispatches to the right action based on the prefix. Unassigned list **excludes** `admin` and `development_lead` users (they implicitly have all projects). NOTE: `ProjectAccessSection` is defined but the live `/admin/users` page renders `UsersSection`; the project-centric component is the alternative/legacy view.

### 2.11 Users table listing (`users-section.tsx`)

- Header actions: **Export to Excel** (dynamic `import("xlsx")`, writes `users-and-access.xlsx` with a "Users" sheet incl. project access + a "Pending Invitations" sheet), **Sync from Clerk**, **+ Add User** (opens the invite dialog).
- Status filter pills: All / Active / Inactive.
- Columns: Name, Email, Role (capitalized badge), Project Access (`UserProjectCell`), Status (`ActiveToggle`), Joined, Change Role (`RoleSelect`).
- Pending Invitations sub-table (only when invites exist): Email, Role, Project Access (amber chips), Invited, Status (Pending badge), Actions (Revoke with confirm).

---

## 3. Cost Categories

Files: `cost-categories/page.tsx`, `actions.ts`, `categories-table.tsx`,
`category-form.tsx`, `export-button.tsx`, `seed-data.ts`.

### 3.1 Table & page

Table **`cost_categories`**: `id`, `name`, `code`, `description` (used as the
"Header Category" label in the UI), `display_order`, `is_active`, `created_by`.

Page loads `select("id, name, code, description, display_order, is_active").order("display_order")`
and renders `<ExportButton>` + `<CategoriesTable>`. Gated to
`admin`/`accounting`/`development_lead`.

### 3.2 CRUD server actions (`actions.ts`, all behind `requireAdmin()`)

- **`createCategory(formData)`**: reads `name`, `code` (`.toUpperCase()`), `description` (or null), `display_order` (parseInt). Validates name/code/order present. Inserts with `created_by = userId`.
- **`updateCategory(id, formData)`**: same field parsing; updates the row.
- **`seedDefaultCategories()`**: inserts all `SEED_CATEGORIES` (each `{ ...c, created_by: userId }`).
- **`deleteCategory(id)`**: pre-checks FK references with `head:true, count:"exact"` against `gate_budgets`, `contracts`, `change_orders`, `contract_line_items` (all on `cost_category_id`). If any reference exists, returns a friendly `"Cannot delete: ... Deactivate it instead."` and does **not** delete. Otherwise deletes.
- **`toggleCategoryActive(id, currentValue)`**: writes `is_active = !currentValue`.

All revalidate `"/admin/cost-categories"`.

### 3.3 UI

- `categories-table.tsx`: scrollable table with columns `# (display_order)`, Code (mono), Name, Header Category (`description`), Status badge, Actions (Edit / Activate-Deactivate / Delete). When empty, shows a "Load default categories (95)" button gated behind a destructive-confirm dialog ("Load all 95 default cost categories?"). Delete also uses a destructive-confirm.
- `category-form.tsx`: form with Name*, Code* (rendered uppercase), Header Category (`description`), Display Order* (number, min 1). Used both inline-new and inline-edit.
- `export-button.tsx`: client-side `xlsx` export → `cost-categories.xlsx`, sheet "Cost Categories", columns: Cost Code, Cost Name, Header Category, Display Order, Status.

> Note the UI calls it "95 default categories" but the actual `SEED_CATEGORIES` array length is **94** (codes below). Reproduce the array exactly; the "95" string is hard-coded copy in `categories-table.tsx`.

### 3.4 FULL seed list (`seed-data.ts`) — reproduce exactly

Each entry is `{ name, code, description (= header group), display_order }`.

**LAND ACQUISITION**
- Acquisition Costs — `000100` — 10
- Acquisition Closing Costs — `000200` — 20
- Other Acquisition Cost — `000900` — 30

**ARCHITECTURE AND ENGINEERING COSTS**
- Architectural Design — `010100` — 40
- Civil Engineering — `010200` — 50
- Landscape Design — `010300` — 60
- MEP Engineering — `010400` — 70
- Renderings, Exhibits, LODs — `010500` — 80
- Structural Design — `010600` — 90
- Survey — `010700` — 100
- Other A&E Costs — `010900` — 110

**CONSULTANT COSTS**
- Branding, Signage & Graphics Consultant — `020100` — 120
- Capital Markets Consultant — `020200` — 130
- Environmental Consultant — `020300` — 140
- Geotech Consultant — `020400` — 150
- IT/AV/Security Consultants — `020500` — 160
- Preconstruction Consultant — `020600` — 170
- Procurement Consultant — `020610` — 180
- Public Relations Consultant — `020620` — 190
- Market Study Consultant — `020700` — 200
- Materials Testing Consultant — `020710` — 210
- Traffic, Parking, Zoning Consultant — `020800` — 220
- Other Consultants — `020900` — 230

**ENTITLEMENT AND PERMIT COSTS**
- Impact Fees — `030100` — 240
- License Fees — `030200` — 250
- Permits (Demo, Site, Building) — `030300` — 260
- Plan Review Fees — `030400` — 270
- Sewer Tap & Inspection fees / Utilities — `030500` — 280
- Other Entitlement and Permit Costs — `030900` — 290

**CARRYING COSTS**
- Owner Association Fees — `040100` — 300
- Real Estate Taxes — `040200` — 310
- Utilities — `040300` — 320
- Other Carrying Costs — `040900` — 330

**DEVELOPMENT FEE COSTS**
- Developer Fee — `050100` — 340
- Guarantee Fee — `050200` — 350
- Owner Representation Fee — `050300` — 360
- SRES Fee — `050400` — 370
- Other Development Fees — `050900` — 380

**LEGAL COSTS**
- Legal & Professional - General — `802100` — 390
- Legal & Professional - Employment — `802101` — 400
- Legal & Professional - Acquisition — `802102` — 410
- Legal & Professional - Securities — `802103` — 420
- Legal & Professional - Entitlements — `802104` — 430
- Legal & Professional - Incentives — `802105` — 440
- Legal & Professional - Lobbying — `802106` — 450
- Legal & Professional - Environmental — `802107` — 460
- Legal & Professional - Financing — `802108` — 470
- Legal & Professional - Commercial Leasing — `802109` — 480
- Legal & Professional - Disputes — `802110` — 490
- Legal & Professional - Sale — `802111` — 500
- Legal & Professional - Deals — `802119` — 510

**LEASING AND SALES COSTS**
- Lease - Commissions — `070100` — 520
- Sales - Commissions — `070200` — 530
- Sales - Closing Costs — `070300` — 540
- Other Leasing and Sales Costs — `070900` — 550

**INSURANCE**
- Bonds/Letter of Credit — `080100` — 560
- Builders Risk — `080200` — 570
- General Liability — `080300` — 580
- Other Insurance Costs — `080900` — 590

**PREOPENING COSTS**
- Admin & General — `090100` — 600
- Reimbursables — `090200` — 610
- Sales and Marketing — `090300` — 620
- Other Preopening Costs — `090900` — 630

**FINANCE COSTS**
- Appraisal — `100100` — 640
- Loan Fees — `100200` — 650
- Interest Carry — `100300` — 660
- Site Inspection Fees — `100400` — 670
- TIF/PILOT Fees — `100500` — 680
- Other Finance Costs — `100900` — 690

**SPECIALTY COSTS**
- Art and Placemaking — `110100` — 700
- FF&E — `110200` — 710
- IT-AV-Security — `110300` — 720
- Parking Systems — `110400` — 730
- Signage and Wayfinding — `110500` — 740
- Other Specialty Costs — `110900` — 750

**CONSTRUCTION COSTS**
- Environmental — `120100` — 760
- Demolition — `120200` — 770
- Sitework (Land Development) — `120300` — 780
- CM Fee - Sitework — `120301` — 790
- Vertical Construction (Core & Shell) — `120400` — 800
- Vertical Construction (Turn Key) — `120500` — 810
- 105 Keswick Construction — `120501` — 820
- 115 Keswick Construction — `120502` — 830
- Future Vertical Development — `120509` — 840
- Future CM Fee - Vertical Construction — `120510` — 850
- CM Vertical Fee - 105 Keswick — `120511` — 860
- CM Vertical Fee - 115 Keswick — `120512` — 870
- Unit Upgrade Allowance — `120520` — 880
- Other Construction Costs — `120900` — 890

**TENANT COORDINATION COSTS**
- Tenant Cash Allowance — `130100` — 900
- Tenant Improvement (Turn Key) — `130200` — 910
- Tenant Coordination AE Costs — `130300` — 920
- Other Tenant Coordination Costs — `130900` — 930

**CONTINGENCY COSTS**
- Hard Cost Contingency — `140100` — 940
- Soft Cost Contingency — `140200` — 950

(94 rows total.)

---

## 4. Audit Log

### 4.1 Writing entries — `lib/audit.ts`

Single helper, **fire-and-forget, never throws**, writes to table **`audit_logs`**
(plural):

```ts
export interface AuditEntry {
  user_id: string; action: string; entity_type: string;
  entity_id?: string; project_id?: string; label?: string;
  payload?: Record<string, unknown>;
}

export async function insertAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert(entry);
    if (error) console.error("[audit] insert failed:", error.message, entry);
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}
```

Notes:
- Table is **`audit_logs`** everywhere. There is **no `audit_log` (singular)** table or reference anywhere in the codebase — the only table name in use is the plural `audit_logs`.
- The Clerk webhook (`session.created`) writes directly to `audit_logs` for `user.login` (it does not go through this helper).
- Row shape persisted: `user_id, action, entity_type, entity_id?, project_id?, label?, payload?` plus DB-generated `id` and `created_at`.

### 4.2 Audit Log page — `audit-log/page.tsx`

Gated to `admin`/`accounting`/`development_lead`. PAGE_SIZE = 100.

Query (server-side, filterable via search params `userId`, `projectId`, `action`,
`from`, `to`, `page`):

```ts
let query = supabase.from("audit_logs").select("*", { count: "exact" })
  .order("created_at", { ascending: false })
  .range(offset, offset + PAGE_SIZE - 1);
if (userId)    query = query.eq("user_id", userId);
if (projectId) query = query.eq("project_id", projectId);
if (action)    query = query.eq("action", action);
if (from)      query = query.gte("created_at", from);
if (to)        query = query.lte("created_at", to + "T23:59:59Z");
```

Also loads `users`, `projects`, `gates`, and the last 200 `budget_imports` (for the
import-history block at the bottom). Builds id→entity maps for display.

Rendered columns: Time (`LocalTime`), User (name + email, falls back to truncated id),
Action (color-coded badge), Project (`code` + name), Detail (`label` plus
`payload` rendered as `key: value · key: value`, filtering null/empty values).
Pagination via prev/next links preserving filters.

### 4.3 Action vocabulary (the logged actions)

`ACTION_LABELS` / `ACTION_COLORS` map (page) — these are the recognized
`action` strings and entity domains:

- `user.login`
- `project.create | project.update | project.delete | project.link_appfolio`
- `gate.create | gate.update | gate.delete | gate.activate | gate.close | gate.upload_bulk | gate.budget_update | gate.reopen`
- `contract.create | contract.update | contract.delete`
- `change_order.create | change_order.update | change_order.approve | change_order.reject | change_order.void`
- `draw_request.create | draw_request.update | draw_request.status | draw_request.delete | draw_request.lines`

Unknown actions display the raw string with a gray badge.

### 4.4 Filters UI — `audit-log-filters.tsx`

Client component using `useRouter`/`useSearchParams`. Fields: User `<select>`,
Project `<select>`, Action `<select>` grouped by domain (`ACTION_GROUPS`: Users,
Projects, Gates, Contracts, Change Orders — note: draw-request actions exist in the
page's label map but are **not** offered in the filter dropdown), From date, To date.
"Apply" pushes a query string; "Clear" resets to `/admin/audit-log`.

### 4.5 Budget Import History (bottom of audit page) — `budget-import-history.tsx`

Pure presentational table fed from `budget_imports` (id, project_id, gate_id,
filename, row_count, imported_at, imported_by, notes). Columns: Imported
(`LocalTime`), Project (`code` + name), Gate, File, Rows, Imported By, Notes. Most
recent first; "N records" count.

---

## 5. Monitoring (admin-only)

Index at `/admin/monitoring` (`monitoring/page.tsx`) — **`admin` only** — links to three
subpages. All three subpages also re-check `admin` only and redirect to `/dashboard`
otherwise. All use `createAdminClient()`.

### 5.1 Chat Log — `monitoring/chat-log/page.tsx`

- Table **`chat_logs`**: `id, user_id, messages (JSONB), response (TEXT), created_at`.
- PAGE_SIZE = 50, ordered newest first, `count: "exact"`.
- Resolves user names via a second `users` query (`in("id", userIds)`).
- For each log: filters `messages` to `role === "user"`, takes the last one, derives a 140-char preview (handles both string content and array-of-blocks content where it finds the `type === "text"` block). Renders user name, timestamp, message count, "Q:" preview, "A:" response preview (first 140 chars).
- Prev/Next pagination.

### 5.2 User Activity — `monitoring/user-activity/page.tsx`

- Table **`user_activity_logs`**: `id, user_id, action, path, metadata (JSONB), created_at`.
- PAGE_SIZE = 100, newest first. Optional `?userId=` filter (`<form method="get">` dropdown of all users).
- Table columns: Date/Time, User (resolved name), Action, Path (mono). Prev/Next pagination preserves the `userId` filter.

### 5.3 AI Usage — `monitoring/ai-usage/page.tsx`

- Table **`ai_usage_logs`**: `id, user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd (NUMERIC), created_at`.
- PAGE_SIZE = 100, optional `?userId=` filter.
- Summary cards: **Total Cost** (`$totalCost.toFixed(4)`), **Total Tokens** (sum of input+output across a full unpaginated `select("cost_usd, input_tokens, output_tokens")`), **Total Requests** (`count`).
- Table columns: Date/Time, User, Model (mono), Input, Output, Cache R, Cache W, Cost (`$x.toFixed(4)`). Prev/Next pagination preserving filter.

> These three tables are created (with RLS) by the apply-migrations route (§8), not by a checked-in numbered migration that the app runs at boot.

---

## 6. AppFolio Admin Buttons

Page `appfolio/page.tsx` (gated `admin`/`accounting`/`development_lead`) shows stats
(linked projects, stored transaction count, last sync), the project→property mapping
table, sync history (last 20 from `appfolio_syncs`), and the action buttons below.
`link-projects.tsx` (project→property-ID linking UI) is documented elsewhere —
briefly: it renders for unlinked active projects and lets an admin set
`appfolio_property_id`.

| Button (component) | POSTs to | Body | UX |
|---|---|---|---|
| **Run Sync** (`sync-button.tsx`) | `/api/appfolio/sync` | `{ fromDate, toDate }` (defaults: 12 months ago → today) | From/To date inputs + "Sync Now". On success shows records fetched / stored / projects synced. Page also notes a daily Vercel Cron sync at `0 6 * * *` (needs `CRON_SECRET`). |
| **Sync Balance Sheet** (`balance-sheet-sync-button.tsx`) | `/api/appfolio/sync-balance-sheet` | `{ asOfDate, accountingBasis }` (date defaults today; basis `Accrual`/`Cash`, default Accrual) | As-of date + basis select + "Sync Now". Stores point-in-time snapshot keyed by property+account+date+basis. Shows accounts fetched / records stored / projects synced. |
| **Assign Gates to Transactions** (`assign-gates-button.tsx`) | `/api/admin/assign-gates` | none (empty POST → all projects) | Single button. Re-assigns transactions to gates by invoice/bill date within gate windows; skips manual overrides. Shows returned `message`. |
| **Apply Pending Migrations** (`apply-migrations-button.tsx`) | `/api/admin/apply-migrations` | none | Single button; disables after done. On error it can render `instructions` and a copy-paste `sql` block. |

All four buttons are simple client components holding
`idle|running|done|error` state and rendering the JSON `message`/`error` returned by
their endpoint.

---

## 7. Auth Pages & Entry Points

### 7.1 Sign-in — `app/(auth)/sign-in/[[...sign-in]]/page.tsx`

Clerk `<SignIn>` catch-all route. Two-panel layout: left brand panel (`KilnLockup`,
marketing copy, feature pills) hidden under `lg`; right panel hosts `<SignIn>` with a
custom `appearance.elements` theme (hidden Clerk header, themed primary button /
inputs / social buttons / footer link). No explicit redirect props — relies on Clerk
env defaults / middleware.

### 7.2 Sign-up — `app/(auth)/sign-up/[[...sign-up]]/page.tsx`

Minimal centered `<SignUp>` catch-all with the Kiln lockup. This is the
`redirectUrl` target of invitations (`${NEXT_PUBLIC_APP_URL}/sign-up`).

### 7.3 Not-invited gate — `app/not-invited/page.tsx`

Static "Access Restricted — KILN is invite-only" card with a Clerk `<SignOutButton>`.
This is where the dashboard layout/middleware sends authenticated Clerk users who have
no provisioned (or inactive) `users` row. (The webhook provisions direct signups as
**inactive `read_only`**, so they land here until an admin activates them.)

### 7.4 Root landing — `app/page.tsx`

```ts
export default function HomePage() { redirect("/dashboard"); }
```

Unconditional server redirect to `/dashboard` (auth handling happens in middleware /
dashboard layout).

### 7.5 Favicon — `app/icon.tsx`

Edge `ImageResponse` (next/og), 32×32 PNG: dark `#141414` rounded square with the Kiln
"K"-style glyph in brand orange `#C4552D` (`<path d="M3 3h26v26h-9V18h-8v11H3V3Z" />`).

---

## 8. `apply-migrations` route — SECURITY-SENSITIVE

File: `app/api/admin/apply-migrations/route.ts`. `POST` only.

**Authz**: requires `x-clerk-user-id` (else 401). Looks up `users.role` via
`createAdminClient()`; allows only `admin` or `development_lead`, else 403. (Note:
narrower than other AppFolio actions — `accounting` is **not** permitted here.)

**Execution strategy (in order):**

1. **`DATABASE_URL`** present → opens a raw Postgres connection with the **`pg`**
   library and runs the entire `MIGRATION_SQL` string in one `client.query(...)`:
   ```ts
   const client = new Client({ connectionString: databaseUrl });
   await client.connect();
   await client.query(MIGRATION_SQL);   // multi-statement
   // ... finally await client.end();
   ```
   This connects directly to Postgres and runs arbitrary DDL **bypassing Supabase/RLS entirely** — the most powerful path. `DATABASE_URL` is the Supabase Postgres connection string.
2. Else if **`SUPABASE_ACCESS_TOKEN`** + a project ref parseable from
   `NEXT_PUBLIC_SUPABASE_URL` → calls the Supabase **Management API**
   `POST https://api.supabase.com/v1/projects/{ref}/database/query` with
   `Authorization: Bearer <token>` and `{ query: MIGRATION_SQL }`.
3. Else → returns 500 with `instructions` + the raw `sql` so an admin can paste it
   into the Supabase SQL editor manually.

**What `MIGRATION_SQL` does (all idempotent):**
- Recreates `users_role_check` to include `accounting` + `development_lead`.
- Creates monitoring tables `chat_logs`, `user_activity_logs`, `ai_usage_logs` (+ indexes) and enables RLS with policies: admins (`get_my_role() = 'admin'`) can SELECT; inserts allowed `WITH CHECK (true)`.
- Adds AppFolio cost-category override columns (`cost_category_code_override`, `_name_override`, `_override_by`, `_override_at`) + partial index.
- Creates `transaction_gate_assignments` (unique per `appfolio_transaction_id`, FK to `gates`, `is_override`, `assigned_by`) + indexes + RLS policies (`is_admin()` full access; everyone can SELECT; PMs/admins can insert/update via `auth.jwt() ->> 'sub'` role check).
- `NOTIFY pgrst, 'reload schema';` to refresh PostgREST's schema cache.

This endpoint is effectively a **remote schema-mutation tool**; its only guard is the
admin/development_lead role check plus the requirement that one of the two
high-privilege secrets is configured server-side.

### 8.1 `assign-gates` route

`app/api/admin/assign-gates/route.ts`. Authz: `admin`/`accounting`/`development_lead`
(401/403 otherwise). Optional JSON body `{ projectId? }` (omit → all). Selects active
projects that have a non-empty `appfolio_property_id`, then calls
`autoAssignGates(supabase, projectList)` from `@/lib/appfolio-sync-core`. Returns
`{ success, projects_processed, message }`. Does not overwrite manual
(`is_override = true`) gate assignments.

### 8.2 `activity` route

`app/api/activity/route.ts`. Any authenticated user (401 if no `x-clerk-user-id`).
Body `{ action?, path?, metadata? }`; `action` truncated to 100 chars (default
`"page_view"`), `path` truncated to 500. Inserts into **`user_activity_logs`** via
`createAdminClient()`. **Errors are silently swallowed** (`.then(()=>{}).catch(()=>{})`)
so activity logging never surfaces to users. Always returns `{ ok: true }`. This is the
write side for the User Activity monitoring page (§5.2).

---

## Summary

- KILN admin uses five roles (`admin`, `accounting`, `project_manager`, `read_only`, `development_lead`); every admin RSC/action/route independently re-checks `users.role` via the service-role `createAdminClient()` (no shared guard), with monitoring locked to `admin` only and user management to `admin`/`development_lead`.
- The invite loop spans Clerk (invitation carrying `public_metadata.role`) + `pending_project_assignments` (pre-acceptance project links) + the Clerk webhook (`user.created` provisions the `users` row and consumes pending assignments; invited users start active, direct signups start inactive `read_only` and hit `/not-invited`).
- Audit writes go through `lib/audit.ts` into the **`audit_logs`** table (only the plural name exists); monitoring reads `chat_logs`, `user_activity_logs`, `ai_usage_logs`, all created/RLS'd by the admin-only `apply-migrations` route which runs raw DDL via `pg`/`DATABASE_URL` (or the Supabase Management API) and is the chief security-sensitive surface.
- Cost categories are CRUD-managed with a 94-row default seed list (codes preserved above; UI mislabels it "95"), and AppFolio admin offers four POST buttons (transaction sync, balance-sheet sync, gate auto-assignment, apply-migrations).


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/05-components-ui.md -->
<!-- ============================================================ -->

# KILN — Shared UI / Layout / Dashboard / Design-System Layer

Rebuild reference for the shared component layer of KILN, a Next.js 14 App
Router / RSC app. Everything below is reproducible without repo access.

Tech context:
- Tailwind CSS, design tokens declared as HSL CSS custom properties consumed
  through Tailwind's `hsl(var(--token))` convention.
- shadcn/ui primitives over Radix UI, styled with `class-variance-authority`
  (`cva`) + the `cn()` helper.
- Icons from `lucide-react`. Auth from `@clerk/nextjs` (`UserButton`).
- Markdown via `react-markdown` + `remark-gfm`.

---

## 1. Design System (`app/globals.css`)

The file is light-theme only; the sidebar carries its own dark tokens. Top of
file imports Tailwind layers:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 1.1 Brand palette (documented in a comment header)

| Name | Hex | Role |
|------|-----|------|
| Terracotta | `#C4552D` | primary action, sidebar active |
| Charcoal | `#141414` | sidebar surface, foreground text |
| Slate | `#3A3F44` | secondary structure |
| Warm Gray | `#E6E2DD` | neutral surfaces, borders |
| Signal Blue | `#2563EB` | informational |
| Approval Green | `#16A34A` | approved / success |

### 1.2 Complete CSS custom properties (`:root` in `@layer base`)

All values are **HSL channel triplets** (no `hsl()` wrapper) so Tailwind can
compose them with alpha. Reproduce exactly:

```css
@layer base {
  :root {
    --background:       36 33% 97%;    /* warm cream off-white */
    --foreground:       0 0% 8%;       /* charcoal #141414 */
    --card:             0 0% 100%;
    --card-foreground:  0 0% 8%;
    --popover:          0 0% 100%;
    --popover-foreground: 0 0% 8%;

    --primary:          15 63% 47%;    /* terracotta #C4552D */
    --primary-foreground: 0 0% 100%;

    --secondary:        36 14% 92%;    /* warm gray surface */
    --secondary-foreground: 0 0% 8%;

    --muted:            36 14% 95%;
    --muted-foreground: 210 6% 38%;    /* slate-derived */

    --accent:           36 14% 89%;    /* warm gray accent */
    --accent-foreground: 0 0% 8%;

    --destructive:      0 72% 45%;
    --destructive-foreground: 0 0% 100%;

    --border:           36 12% 86%;
    --input:            36 12% 86%;
    --ring:             15 63% 47%;
    --radius:           0.5rem;

    /* Sidebar tokens (charcoal surface, terracotta active) */
    --sidebar-bg:       0 0% 8%;       /* charcoal #141414 */
    --sidebar-fg:       36 14% 80%;
    --sidebar-muted:    36 8% 55%;
    --sidebar-active-bg: 15 63% 47%;   /* matches --primary */
    --sidebar-hover-bg: 0 0% 14%;
    --sidebar-border:   0 0% 18%;

    /* Status colors */
    --status-active:    142 76% 36%;   /* approval green #16A34A */
    --status-hold:      38 90% 45%;
    --status-complete:  221 83% 53%;   /* signal blue #2563EB */
    --status-archived:  210 6% 45%;
  }
}
```

These tokens map to Tailwind theme keys (in `tailwind.config`, not read here
but implied): `bg-background`, `text-foreground`, `bg-primary`,
`text-primary-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`,
`bg-secondary`, `bg-accent`, `bg-destructive`, `border-border`, `border-input`,
`ring-ring`, and `rounded-*` derived from `--radius` (0.5rem). The sidebar/status
tokens are consumed inline via `hsl(var(--…))` (e.g. `style={{ background:
"hsl(var(--sidebar-bg))" }}`).

### 1.3 Base layer global rules

```css
@layer base {
  * { @apply border-border; }          /* default border color everywhere */

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";  /* font stylistic sets */
  }
}
```

Fonts: configured via `next/font` (per project CLAUDE.md) and exposed through
the Tailwind font family; the OpenType `cv02/cv03/cv04/cv11` stylistic sets are
enabled globally on `body`.

### 1.4 `.kiln-table` component classes (`@layer components`)

Add `class="kiln-table"` to any `<table>` for branded headers. Reproduce:

```css
@layer components {
  .kiln-table thead tr {
    @apply border-b;
    background-color: hsl(var(--sidebar-bg));   /* charcoal */
    color: hsl(var(--sidebar-fg));
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .kiln-table thead th {
    @apply px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase;
    color: hsl(36 14% 75%);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .kiln-table tbody tr {
    @apply border-b transition-colors last:border-0;
  }
  .kiln-table tbody tr:nth-child(even) { @apply bg-muted/30; }   /* zebra */
  .kiln-table tbody tr:hover           { @apply bg-accent/60; }
}
```

### 1.5 Print styles (`@media print`) — applies to ALL pages

Key behaviors: landscape, white background, hide chrome (`aside`, `header`,
`nav`, `.print:hidden`), force color rendering, brand-dark table headers, and a
dedicated `#pcm-report` 15-column fit. Reproduce verbatim:

```css
@media print {
  html, body { height: auto; overflow: visible; background: white !important; font-size: 11pt; }
  @page { size: landscape; margin: 0; }        /* margin:0 removes browser URL/title headers */
  html, body { padding: 0.4in; }               /* replaces @page margin */

  aside, header, nav, .print\:hidden { display: none !important; }

  .print-header { display: block !important; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 2pt solid #141414; }
  .print-header h1 { font-size: 14pt; font-weight: 700; color: #141414; }
  .print-header p  { font-size: 9pt; color: #555; }

  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  table thead tr, .kiln-table thead tr { background-color: #141414 !important; color: white !important; }
  table thead th, .kiln-table thead th { color: #cbc6be !important; font-size: 7pt !important; padding: 4pt 6pt !important; text-transform: uppercase; letter-spacing: 0.04em; }
  table tbody td { font-size: 8pt !important; padding: 3pt 6pt !important; }
  table tbody tr:nth-child(even) { background-color: #f6f3ee !important; }
  table { border-collapse: collapse; width: 100%; }

  #pcm-report { overflow: visible !important; }
  #pcm-report table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; border-collapse: collapse !important; }
  /* Cost Code 7%, Description 14%, 13 data cols share remaining ~6.08% each */
  #pcm-report col:nth-child(1) { width: 7%; }
  #pcm-report col:nth-child(2) { width: 14%; }
  #pcm-report col:nth-child(n+3) { width: 6.08%; }
  #pcm-report th, #pcm-report td { padding: 1pt 2pt !important; white-space: normal !important; word-break: break-word !important; overflow: hidden !important; font-size: 6pt !important; line-height: 1.2 !important; }
  #pcm-report th { font-size: 5pt !important; line-height: 1.1 !important; }

  .page-break-before { page-break-before: always; }
  .page-break-after  { page-break-after: always; }
  .avoid-break       { page-break-inside: avoid; }
}
```

---

## 2. `cn()` helper (`lib/utils.ts`)

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
Standard shadcn merge: `clsx` for conditional joins, `tailwind-merge` to
de-dupe conflicting Tailwind classes. Used everywhere.

---

## 3. Layout / Shell

### 3.1 `DashboardShell` (`components/layout/dashboard-shell.tsx`) — `"use client"`

Props: `{ role: string; children: React.ReactNode }`.

Composition (top-to-bottom):
- Wraps everything in `<ConfirmDestructiveProvider>` (section 5.4).
- Root: `flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible`.
- **Desktop sidebar**: `<div className="hidden md:flex h-full print:hidden"><Sidebar role={role} /></div>` — always visible at `md+`, hidden in print.
- **Mobile drawer**: state `mobileOpen`. When open, renders a fixed `inset-0 z-50 md:hidden` overlay = backdrop (`bg-black/40 backdrop-blur-sm`, click-to-close) + a `w-64` slide-in panel (`animate-in slide-in-from-left-2 duration-200`) containing `<Sidebar role={role} onClose={closeDrawer} />`.
- **Main**: `flex flex-1 flex-col … min-w-0` with a scrollable `<main>` rendering `children` plus a footer.
- **Footer**: `border-t mt-8 px-4 sm:px-6 py-3 text-[11px] text-muted-foreground`, hidden in print, content: left `KILN by RiverWest` (KILN bold), right `kilnhq.com`.
- Mounts three always-on, render-nothing/floating helpers at the end:
  `<ActivityTracker />`, `<QuickStartTrigger />`, `<AiChatWidget />`.

Mobile nav behavior:
- Listens on `window` for the custom `"open-mobile-nav"` event → `setMobileOpen(true)`.
- While `mobileOpen`, sets `document.body.style.overflow = "hidden"` (scroll lock), restored on close/unmount.

### 3.2 `Header` (`components/layout/header.tsx`) — server component

Props: `{ title: string; helpContent?: PageHelpContent }`.

```
<header class="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6 print:hidden">
  left:  <MobileNavTrigger /> + <h1 class="text-lg font-semibold text-foreground truncate">{title}</h1>
  right: {helpContent && <PageHelp content={helpContent} />} + <UserButton afterSignOutUrl="/sign-in" />
</header>
```
`UserButton` is Clerk's avatar/account menu. The page-help `?` button only
appears when `helpContent` is supplied.

### 3.3 `MobileNavTrigger` (`components/layout/mobile-nav-trigger.tsx`) — `"use client"`

Hamburger button, `md:hidden`, icon `Menu` (lucide). On click dispatches
`window.dispatchEvent(new Event("open-mobile-nav"))` — decoupled from the shell
via the window event. Classes: `flex h-9 w-9 items-center justify-center
rounded-md text-muted-foreground hover:bg-muted hover:text-foreground …`.

### 3.4 `Sidebar` (already documented elsewhere — brief)

Client component (`components/layout/sidebar.tsx`). Charcoal surface using
`--sidebar-*` tokens. Renders `<KilnLockup>` at top, nav links (`Dashboard`,
`Projects`, `Vendors`), a collapsible **Reporting** group (`reportItems`: Project
Cost Management, Cost Detail, Vendor Detail, Commitment Detail, Change Order Log,
Balance Sheet, etc.), a role-gated **Settings/Admin** group (`settingsItems`:
Users & Access, Cost Categories, AppFolio, …), and a Quick Start Guide link that
dispatches `"open-quickstart"`. Accepts `role` (for gating) and optional
`onClose` (mobile). Uses `usePathname()` for active-state highlighting.

---

## 4. Brand logo (`components/brand/kiln-logo.tsx`)

Two exports.

### 4.1 `KilnMark`
Props: `{ className?: string; title?: string ("KILN") }`. An inline SVG
"chamber" mark — a 32×32 solid block with a rectangular doorway notch in the
bottom edge. `fill="currentColor"` so color comes from `text-*`. Default size
`h-6 w-6`.
```tsx
<svg viewBox="0 0 32 32" fill="currentColor" role="img" aria-label={title} className={cn("h-6 w-6", className)}>
  <path d="M3 3h26v26h-9V18h-8v11H3V3Z" />
</svg>
```

### 4.2 `KilnLockup`
Props:
- `endorsed?: boolean` (default `false`) — show the "by RiverWest" endorser line.
- `size?: "sm" | "md" | "lg"` (default `"md"`).
- `invert?: boolean` (default `false`) — force light/white text for dark surfaces.
- `className?: string`.

Size map:
```ts
const sizeMap = {
  sm: { mark: "h-5 w-5", word: "text-[13px]", endorser: "text-[10px]" },
  md: { mark: "h-7 w-7", word: "text-base",   endorser: "text-[11px]" },
  lg: { mark: "h-9 w-9", word: "text-xl",     endorser: "text-xs" },
};
```
Layout: `flex items-center gap-2.5`. The mark is rendered as
`text-primary shrink-0` (terracotta) at the size's `mark` class. The wordmark
`KILN` is `font-extrabold tracking-tight uppercase` colored `text-white` when
`invert` else `text-foreground`. Endorser line "by RiverWest" colored
`text-[hsl(var(--sidebar-muted))]` when `invert` else `text-muted-foreground`.
Used in headers, sidebar, and auth pages.

---

## 5. shadcn UI primitives (`components/ui/*`)

All use `cn()` and (where stateful) Radix. Display names mirror the Radix root.

### 5.1 `avatar.tsx` — wraps `@radix-ui/react-avatar`
- `Avatar` = `AvatarPrimitive.Root`, classes `relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full`.
- `AvatarImage` = `AvatarPrimitive.Image`, `aspect-square h-full w-full`.
- `AvatarFallback` = `AvatarPrimitive.Fallback`, `flex h-full w-full items-center justify-center rounded-full bg-muted`.

### 5.2 `badge.tsx` — pure `cva`, no Radix
Base: `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs
font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring
focus:ring-offset-2`. Variants:
```ts
default:     "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
secondary:   "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80"
outline:     "text-foreground"
```
Default variant `default`. `Badge` is a `<div>` spreading
`badgeVariants({ variant })`. Exports `Badge`, `badgeVariants`.

### 5.3 `button.tsx` — `cva` + `@radix-ui/react-slot`
Base: `inline-flex items-center justify-center whitespace-nowrap rounded-md
text-sm font-medium ring-offset-background transition-colors
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50`.
```ts
variant: {
  default:     "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline:     "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost:       "hover:bg-accent hover:text-accent-foreground",
  link:        "text-primary underline-offset-4 hover:underline",
}
size: {
  default: "h-10 px-4 py-2",
  sm:      "h-9 rounded-md px-3",
  lg:      "h-11 rounded-md px-8",
  icon:    "h-10 w-10",
}
```
Defaults `variant:"default", size:"default"`. `asChild` prop → renders Radix
`Slot` instead of `<button>`. forwardRef. Exports `Button`, `buttonVariants`.

### 5.4 `dialog.tsx` — wraps `@radix-ui/react-dialog`
Re-exports `Dialog` (Root), `DialogTrigger`, `DialogPortal`, `DialogClose`.
- `DialogOverlay`: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm` + open/close fade animations.
- `DialogContent`: portals overlay + content. Centered card: `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 bg-background p-6 shadow-lg … rounded-xl border`, with zoom/slide in-out data-state animations. Renders children + an absolute top-right close button (`X` icon, `sr-only "Close"`).
- `DialogHeader`: `flex flex-col space-y-1.5 text-center sm:text-left` div.
- `DialogTitle`: `text-lg font-semibold leading-none tracking-tight`.
- `DialogDescription`: `text-sm text-muted-foreground`.

### 5.5 `separator.tsx` — wraps `@radix-ui/react-separator`
`Separator` props default `orientation="horizontal"`, `decorative=true`. Classes
`shrink-0 bg-border` + `h-[1px] w-full` (horizontal) or `h-full w-[1px]`
(vertical).

---

## 6. Shared components

### 6.1 `ActivityTracker` (`components/activity-tracker.tsx`) — `"use client"`
Renders `null`. Mounted once in `DashboardShell`. Uses `usePathname()`; on every
route change (deduped via a `lastPath` ref) it fires:
```ts
fetch("/api/activity", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "page_view", path: pathname }),
}).catch(() => {});
```

### 6.2 `AiChatWidget` (`components/ai-chat-widget.tsx`) — `"use client"`
Floating bottom-right AI assistant. Mounted once in `DashboardShell`.

State: `open`, `messages` (`Anthropic.MessageParam & { id }`), `input`,
`streaming`; refs `bottomRef`, `inputRef`, `abortRef` (AbortController).

Triggers / events:
- Listens on `window` for `"open-ai-chat"` (a `CustomEvent<string>`); the
  `detail` is an optional query. On receipt: opens the panel and, if a query is
  present, calls `sendMessage(query)` after 100ms. (Dispatched by
  `DashboardChatInput`.)
- Bottom-right bubble (`h-12 w-12 rounded-full`) toggles `open`. Bubble icon:
  `MessageCircle` when closed (primary bg), `X` when open (muted bg).
- Container: `fixed bottom-6 right-6 z-50 … print:hidden`.

Panel: `w-[calc(100vw-3rem)] max-w-[380px] h-[min(520px,75vh)] rounded-xl border
shadow-2xl`. Header ("Ask anything" + a `Trash2` clear button shown when there
are messages + an `X` close). Empty state hint text. Footer textarea (Enter to
send, Shift+Enter newline) + send button (`Send`, or spinning `Loader2` while
streaming).

**Streaming call to `/api/chat`** (the core integration):
```ts
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
  signal: controller.signal,
});
if (!res.ok || !res.body) throw new Error("Request failed");
const reader = res.body.getReader();
const decoder = new TextDecoder();
let accumulated = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
}
```
The endpoint streams **raw text** (not SSE/JSON); the widget appends decoded
chunks directly into the assistant message. A placeholder assistant message
(empty content) is inserted before streaming begins. Errors (non-Abort) replace
content with "Something went wrong. Please try again." `handleClose` aborts the
in-flight request; `handleClear` aborts + resets all state.

**Markdown rendering (`ChatMessage`):** user messages render plain
(`whitespace-pre-wrap`, primary bubble). Assistant messages render through
`<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: … }}>` inside a
`prose prose-sm prose-slate` container with a large block of arbitrary-variant
table/list/code/heading/blockquote styles (e.g. `[&_table]:w-full
[&_th]:bg-slate-100`, `[&_code]:bg-slate-100`, etc.). Custom `a` renderer: links
starting with `/` render as a `<button>` calling `onNavigate(href)` (closes
panel + `router.push(href)`); external links open in a new tab with
`rel="noopener noreferrer"`. While streaming the last assistant message shows a
blinking caret (`animate-pulse`). A hover-revealed copy button uses
`navigator.clipboard.writeText` and shows a green `Check` for 2s.

### 6.3 `ConfirmDestructive` (`components/confirm-destructive.tsx`) — `"use client"`
Destructive-action confirmation modal pattern, provided via React context.

- `ConfirmDestructiveProvider` mounted once (in `DashboardShell`). Exposes via
  context an async `open(opts)` function. `useConfirmDestructive()` returns it
  (throws if used outside the provider).
- `ConfirmOptions`: `{ title; body?: ReactNode; confirmLabel?; cancelLabel?;
  reasonLabel?; reasonPlaceholder?; requireReason?: boolean }`.
- Returns `Promise<string | null>`: resolves to the **trimmed reason string**
  on confirm (may be `""` when not required), or `null` on cancel/Escape/backdrop.

Usage:
```ts
const confirm = useConfirmDestructive();
const reason = await confirm({ title: "Delete project?", confirmLabel: "Delete" });
if (reason === null) return;        // cancelled
await deleteProject(id, reason);
```
UI: full-screen `z-[60]` backdrop `bg-black/80 backdrop-blur-sm`; card
`max-w-md rounded-xl border`. Header has a `bg-destructive/10` circle with
`AlertTriangle` (destructive), the title, and optional body. A required/optional
`reason` `<textarea>` (auto-focused; required shows red `*`, optional shows
"(optional)"). Hint "⌘/Ctrl + Enter to confirm." Footer: Cancel (outline) +
Confirm (`bg-destructive`; disabled while `requireReason` and reason empty, or
while `busy`; shows `Loader2` when busy). Escape cancels (unless busy); body
scroll locked while open.

### 6.4 `InfoTip` (`components/info-tip.tsx`) — `"use client"`
`<InfoTip text="…" />`. An amber circular `!` badge (`bg-amber-100
border-amber-400 text-amber-700`, `cursor-help`) with a CSS hover tooltip — a
`w-72 rounded-lg bg-slate-800 text-white` bubble positioned `bottom-full left-0`,
fading in on `group-hover`, with a small triangular arrow. Pure CSS, no JS state.

### 6.5 `PageHelp` (`components/page-help.tsx`) — `"use client"`
Renders the `?` help button in the header and a slide-in help panel. Types:
```ts
interface HelpSection { heading: string; body: string }
interface HelpAction  { label: string; desc: string }
interface PageHelpContent {
  title: string; description: string;
  sections?: HelpSection[]; actions?: HelpAction[]; tip?: string;
}
```
Props: `{ content: PageHelpContent }`.

Trigger: `h-8 w-8 rounded-full border` `HelpCircle` button (hover → primary),
`print:hidden`. Panel: right-anchored modal (`fixed inset-0 flex items-start
justify-end`, backdrop `bg-black/20 backdrop-blur-sm`), card `max-w-md
max-h-[90vh]` sliding in (`animate-in slide-in-from-right-4`). Sections rendered
in order:
1. Header (HelpCircle chip + `content.title` + "Page Help").
2. `content.description` paragraph.
3. **Key Actions** (if `actions`): bordered list, each row a `ChevronRight` +
   `label` (bold) + `desc`.
4. **Sections** (if `sections`): each `heading` (uppercase) + `body`.
5. **Tip** (if `tip`): `Lightbulb` callout in `bg-primary/8 border-primary/20`.
6. Footer link "Open full Quick Start Guide →" which closes the panel then
   dispatches `window.dispatchEvent(new Event("open-quickstart"))` after 100ms.

Closes on Escape and on backdrop click.

### 6.6 `LocalTime` (`components/local-time.tsx`) — `"use client"`
Props `{ iso: string; timeClassName?: string ("text-[10px]") }`. Renders empty
on the server (avoids hydration mismatch); in `useEffect` formats `iso` to local
`en-US` date (`{month:"short", day:"numeric", year:"numeric"}`) and time
(`hour/minute/second, 2-digit`). Outputs `<div>{date}</div>` + a time `<div>`
using `timeClassName`.

### 6.7 `TimeGreeting` (`components/time-greeting.tsx`) — `"use client"`
Props `{ name: string | null | undefined }`. Computes from local `getHours()`:
`<12` "Good morning", `<17` "Good afternoon", else "Good evening"; appends
`, {name}` if name present.

### 6.8 Quickstart

**`QuickStartTrigger`** (`components/quickstart/quickstart-trigger.tsx`,
`"use client"`): mounted once in shell. On mount: auto-opens the modal the first
time (when `localStorage["qs_seen_v1"]` is absent), and adds a `window` listener
for the `"open-quickstart"` event to re-open it on demand (dispatched by the
sidebar link and by `PageHelp`). Renders `<QuickStartModal isOpen … onClose … />`.

**`QuickStartModal`** (`components/quickstart/quickstart-modal.tsx`): a 9-step
guided tour (`sections` array, indices 0–8): Welcome, Navigating the App,
Projects & Gates, Contracts & SOV, PCM Report (13-column reference table),
Reports Index & Drilldown, Vendors & Compliance, Admin Panel, Quick Tips. Each
section has `{ title, icon (lucide), content (JSX) }`. Helper subcomponents:
`Screenshot` (img with broken-image dashed-box fallback), `Hint` (primary-tinted
💡 callout), `StepList` (numbered list). Modal: centered `max-w-3xl`, header with
`BookOpen` + "Quick Start Guide" + `{step+1}/{sections.length}`, step title row,
scrollable body, footer with dot pagination (active dot wider `w-5`) +
Previous/Next or Done. `handleClose` sets `localStorage["qs_seen_v1"]="1"` so it
won't auto-open again. Closes on Escape / backdrop click.

### 6.9 `ExpandButton` / `ExpandedModal` (`components/expandable-card.tsx`) — `"use client"`
Used by all dashboard alert/list widgets to expand into a large modal.
- `ExpandButton`: small `Maximize2` icon button, placed in a card header.
- `ExpandedModal`: `{ open, onClose, children }`. Centered `max-w-5xl
  max-h-[85vh]` modal over `bg-black/40 backdrop-blur-sm`; close on Escape /
  backdrop; body scroll locked while open; top-right `X`.

---

## 7. Dashboard home + widgets

### 7.1 `DashboardPage` (`app/(dashboard)/dashboard/page.tsx`) — RSC, `force-dynamic`
Server component. Flow:
1. Reads Clerk user id from `headers().get("x-clerk-user-id")`; loads
   `users.full_name, role` via Supabase **admin** client. Default role
   `"read_only"`.
2. `isAdmin = role in {admin, accounting, development_lead}` → sees all
   projects. Otherwise resolves `allowedProjectIds` from `project_users` and
   filters the `projects` query by them.
3. Empty state: if no projects, renders header + greeting + a message (admins
   get a "Create your first project" link; others "contact your admin").
4. Loads active gates → `gate_budgets` (sums `revised_budget` per gate, then per
   project), proposed `change_orders` (PM/admin only), `appfolio_transactions`
   spend (paid+unpaid summed per property, `limit 5000`), `cost_categories`
   (active), per-category actuals (`limit 10000`), recent `appfolio_transactions`
   bills (last **90 days**, `limit 1000`), COI + Lien Waiver `vendor_documents`,
   and non-terminated `contracts` (for total committed).
5. `usd()` compact formatter: `>=1M → $X.XM`, `>=1K → $XK`, else `$X`.

Render: `<Header title="Dashboard" helpContent={HELP.dashboard} />`, a
`<TimeGreeting>` h2, `<DashboardChatInput>`, a tagline, a **4-card KPI strip**
(Total Projects; Total Commitments; Forecast to Complete = `max(0, portfolioValue
- totalSpent)`; and for non-read_only "Total Exposure" = pending CO value with a
pending-CO count, else "Your Role"), then `<ProjectGrid>`, conditional
`<BudgetAlerts>` / `<COIAlerts>` / `<LienWaiverAlerts>` (only when their arrays
are non-empty), and a `RecentBills` + (PM/admin) `PendingCOs` grid
(`lg:grid-cols-5`, 3/2 split).

**Over-budget alert computation** (the key threshold logic):
```ts
const overBudgetAlerts: OverBudgetAlert[] = [];
for (const gb of rawGateBudgets ?? []) {
  if (Number(gb.revised_budget) <= 0) continue;
  const projectId = gateToProject.get(gb.gate_id);
  if (!projectId) continue;
  const propertyId = projectToProperty.get(projectId);
  if (!propertyId) continue;
  const key = `${propertyId}::${gb.cost_category_id}`;
  const actual = actualsByPropertyCategory.get(key) ?? 0;   // summed invoice_amount, GL code → category
  const overage = actual - Number(gb.revised_budget);
  if (overage <= 0) continue;                                // only over-budget rows
  // …push {project, gate, category, revised_budget, actual_amount, overage}
}
overBudgetAlerts.sort((a, b) => b.overage - a.overage);      // largest overage first
```
Actuals are matched by uppercased/trimmed `gl_account_id` → cost-category `code`.

COI / Lien Waiver alert windows: documents with a non-null `expiration_date`
`<=` **60 days** out (`in60DaysStr`) including already-expired, filtered to docs
with no `project_id` or an **active** project. `days_until_expiry` =
round((exp − today)/86_400_000).

### 7.2 `BudgetAlerts` (`budget-alerts.tsx`) — `"use client"`
Props `{ alerts: OverBudgetAlert[] }`; renders nothing if empty. Header: red dot
+ "Budget Alerts" + count + total overage (red). Inline `ExpandButton` opens an
`ExpandedModal` with the same list (`expanded` adds a project `<select>`).
Filters: overage buttons `["All","5+ over","10+ over"]` → thresholds **$5,000 /
$10,000**:
```ts
if (overageFilter === "5+ over"  && a.overage < 5_000)  return false;
if (overageFilter === "10+ over" && a.overage < 10_000) return false;
```
Each row is a `Link` to `/projects/{project_id}/gates/{gate_id}`, showing
project · gate, `{category_code} {category_name}`, budget/actual, and
`+{overage}` with `pctOver = round((actual-budget)/budget*100)`. `usd()` here is
`Intl.NumberFormat` currency, 0 fraction digits.

### 7.3 `COIAlerts` (`coi-alerts.tsx`) — `"use client"`
Table of COI documents. Header summary "{n} expired · {n} expiring within 60
days". Expanded view adds vendor search, status filter buttons
`["All","Expired","≤30 days","31–60 days"]`, and a coverage-type `<select>`.
Status filter logic:
```ts
if (statusFilter === "Expired"     && a.days_until_expiry >= 0) return false;
if (statusFilter === "≤30 days"    && (a.days_until_expiry < 0  || a.days_until_expiry > 30)) return false;
if (statusFilter === "31–60 days"  && (a.days_until_expiry < 31 || a.days_until_expiry > 60)) return false;
```
Columns: Vendor (link to `/vendors/{name}`), [Project when expanded], Document,
Coverage, Expires (red if expired else amber-700), Status pill — `bg-red-100`
expired / `bg-orange-100` `<=30d` / `bg-amber-100` otherwise; label
`Expired Xd ago` / `Expires today` / `Xd left`. Non-expanded table is
`max-h-64` scrollable with sticky header.

### 7.4 `LienWaiverAlerts` (`lien-waiver-alerts.tsx`) — `"use client"`
Same table pattern as COI but `expiration_date` may be `null`. Buckets:
expired (`days<0`), expiring soon (`days>=0`), and **no expiry set** (`days===null`
→ gray "No date set" pill). Filters: vendor search + project `<select>`. Columns
mirror COI (Type = coverage_type). Same `≤30d` orange / else amber threshold for
non-expired pills.

### 7.5 `PendingCOs` (`pending-cos.tsx`) — `"use client"`
List of proposed change orders awaiting approval (PM/admin only). Header: count
+ total amount. Expanded controls: project `<select>`, age buttons
`["All","7+ days","14+ days"]`, sort `<select>`
`["Oldest first","Newest first","Amount ↓","Amount ↑"]`. Age =
`floor((now - proposed_date)/86_400_000)`. Filter:
```ts
if (ageFilter === "7+ days"  && age < 7)  return false;
if (ageFilter === "14+ days" && age < 14) return false;
```
Each row `Link` → `/projects/{project_id}`. Age-coded dot/label: **>=14d red**,
**>=7d amber**, else muted. Shows `co_number`, `usd(amount)`, description,
`{age}d ago` / "Today".

### 7.6 `RecentBills` (`recent-bills.tsx`) — `"use client"`
AppFolio transactions table. Time-range `<select>`:
`Last 24 hours/3 days/week/30 days/90 days` (days 1/3/7/30/90; default **7**).
`cutoff` = today − days. Expanded adds vendor search, project `<select>`, and
status buttons `["All","Paid","Unpaid","Partial"]`. Sorted by `bill_date` desc.
Columns: Date, Project (link), Vendor (link `/vendors/{name}`), Cost Category
(`code name`, or italic "Unmatched" when no code), Amount (`paid+unpaid`),
Status pill (`Paid`→green, `Unpaid`→yellow, else blue). Non-expanded table
`max-h-72` scrollable. Summary shows count + total.

### 7.7 `ProjectGrid` (`project-grid.tsx`) — `"use client"`
Card grid (`sm:grid-cols-2 xl:grid-cols-3`). Filter tabs
`all/active/on_hold/completed` with per-status counts; active tab `bg-primary
text-primary-foreground`. Each card `Link` → `/projects/{id}`. Card header: a
project image (`next/image fill`) or a **monogram** box colored by hashing the
code:
```ts
const MONOGRAM_PALETTES = ["bg-blue-100 text-blue-700","bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700","bg-amber-100 text-amber-700","bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700"];
function monogramStyle(code){ const sum = code.split("").reduce((a,c)=>a+c.charCodeAt(0),0); return MONOGRAM_PALETTES[sum % 6]; }
```
showing `code.slice(0,4)`. Name + code (+ gate name) + status pill
(`STATUS_BADGE`: active green / on_hold yellow / completed blue / archived gray).
**`BudgetBar`** — spend/budget progress; thresholds: `>=0.95` red, `>=0.8`
amber, else emerald; "No budget entered" when budget `<=0`. Width = clamped
percent.

### 7.8 `SyncStatusBanner` (`sync-status-banner.tsx`) — server component
Props `{ sync: SyncStatus | null }`. (Defined but not rendered by the current
`page.tsx`.) Shows AppFolio sync state: null → dashed "No AppFolio sync recorded
yet" + "Sync now →". Otherwise color/icon by status: `running`
(blue, spinning `Loader2`, "Sync in progress…"), `failed` (destructive,
`XCircle`, error message, "Retry sync →"), `completed` (emerald `CheckCircle2`,
"Completed {relative} · {n} records", "Manage →"). `fmtRelative` →
just now / Xm / Xh / Xd ago. Links to `/admin/appfolio`.

### 7.9 `DashboardChatInput` (`dashboard-chat-input.tsx`) — `"use client"`
The inline AI prompt on the dashboard. `Sparkles` "AI ASSISTANT" label, an input
with a primary arrow send button, and 3 suggestion chips
("Summarize my active projects", "What are the pending change orders?",
"Show unpaid bills this month"). Submitting (Enter / arrow / chip) dispatches:
```ts
window.dispatchEvent(new CustomEvent("open-ai-chat", { detail: query }));
```
which `AiChatWidget` (section 6.2) catches to open the panel and run the query.

---

## 8. `lib/help.ts` — page-level help content

`export const HELP: Record<string, PageHelpContent>` keyed by page slug,
consumed by `<Header helpContent={HELP.<key>} />` and surfaced through
`PageHelp` (section 6.5). Keys present: `dashboard`, `projects`, `projectDetail`,
`drawDetail`, `contractDetail`, `gateDetail`, `reports`, `pcmReport`,
`costDetail`, `vendorDetail`, `gateDetailReport`, `changeOrderLog`,
`commitmentDetail`, `balanceSheet`, `trialBalance`, `reportingPackage`,
`adminIndex`, `adminUsers`, `costCategories`, `vendors`, `vendorProfile`,
`auditLog`, `appfolio`.

Each entry follows `PageHelpContent`: a `title`, a `description`, usually an
`actions[]` array (`{label, desc}`), optionally `sections[]`
(`{heading, body}` — `body` may contain `\n` for multi-line rendering), and a
`tip`. Representative sample:

```ts
dashboard: {
  title: "Dashboard",
  description: "Your real-time overview of all projects. See portfolio-level stats at a glance, then drill into any project for detail.",
  actions: [
    { label: "Stats bar", desc: "Active projects, portfolio budget, total deployed costs, and pending change orders…" },
    { label: "Project cards", desc: "Each card shows budget consumption. Green = under budget, amber = over 90%, red = over…" },
    { label: "Recent Bills", desc: "Last 90 days of AppFolio transactions…" },
    { label: "Pending COs", desc: "Change orders awaiting approval… grey = recent, amber = 14+ days, red = 30+ days…" },
    { label: "AI chat bar", desc: "Type any question… Press Enter or click the arrow to send…" },
    { label: "COI Alerts card", desc: "Lists all Certificates of Insurance expiring within 60 days…" },
    { label: "Budget Alerts card", desc: "Shows cost categories that have exceeded their gate budget…" },
  ],
  tip: "The dashboard updates every time the page loads. AppFolio data reflects the most recent sync…",
},
```

`pcmReport`, `contractDetail`, `changeOrderLog`, `adminUsers`, and `appfolio`
additionally use `sections[]` (e.g. the PCM "Column Reference" =
`A=Original Budget · B=Authorized Adj. · C=Current Budget (A+B) · … ·
M=Balance to Complete (C−L)`). The full set of entries is exhaustive
documentation for every page and is the single source of truth for the help
panels — recreate each key with the same `title/description/actions/sections/
tip` shape.

---

## Summary

The design system is a light terracotta-on-cream theme defined entirely as HSL
CSS custom properties (`--primary` terracotta `#C4552D`, `--foreground`/sidebar
charcoal `#141414`, full `--sidebar-*` and `--status-*` token sets), plus the
`.kiln-table` branded-header component classes and an extensive `@media print`
block (landscape, dark headers, a fixed 15-column `#pcm-report` layout).
`DashboardShell` composes a desktop sidebar, an event-driven mobile drawer, and
the main content, and mounts the always-on `ActivityTracker`, `QuickStartTrigger`,
`AiChatWidget`, and `ConfirmDestructiveProvider`; shadcn primitives wrap Radix
with `cva` variants and the `KilnLockup`/`KilnMark` brand SVG renders the
wordmark. Dashboard widgets are client components driven by RSC-computed data —
over-budget alerts (overage > 0, $5K/$10K filters), 60-day COI/lien-waiver expiry
alerts, age-coded pending COs, recent bills, and budget-bar project cards — with
help content centralized in `lib/help.ts` surfaced via `PageHelp`.


<!-- ============================================================ -->
<!-- SOURCE FILE: handoff/06-api-extraction.md -->
<!-- ============================================================ -->

# 06 — Claude-Powered Document Extraction API Routes

This document covers the two AI document-extraction endpoints in KILN. They let
the client upload a file (PDF or image), send it to Claude as a vision/document
content block, and receive structured JSON back for prefilling a form.

- `POST /api/extract-contract` — extracts construction-contract key terms.
- `POST /api/extract-document` — extracts Certificate of Insurance (COI) fields.

The two routes are **byte-for-byte identical except for the user-prompt text**
(the per-file extraction instructions / JSON shape). Everything else — imports,
auth, file handling, model, `max_tokens`, content-block construction, response
parsing, error handling — is the same. This document gives the shared skeleton
once, then the two prompts and their DB mappings.

> Out of scope (documented elsewhere): the agentic `/api/chat` route, the Clerk
> webhook (`/api/webhooks/*`), and all AppFolio routes. They are referenced but
> not re-described here.

---

## 1. Shared infrastructure

### 1.1 Imports & Anthropic client

Both files begin identically:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

const client = new Anthropic();
```

- `new Anthropic()` is constructed **with no arguments**, so the SDK reads the
  API key from the `ANTHROPIC_API_KEY` environment variable. **This env var is a
  hard dependency** — without it, the constructor (or first request) throws and
  the route returns a 500. There is no explicit key-presence check; it relies on
  the SDK's default behavior.
- The client is created at **module top level**, so it is instantiated once per
  serverless instance (cold start), not per request.

### 1.2 Supported image types

```ts
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];
```

### 1.3 HTTP method & auth

- **Method:** `POST` only (a single `export async function POST(req: NextRequest)`).
  No `GET`/`PUT`/etc. handlers are exported.
- **Auth check:** reads the `x-clerk-user-id` request header (set by the Clerk
  middleware — see below) and 401s if absent:

```ts
const headersList = await headers();
const userId = headersList.get("x-clerk-user-id");
if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

  Note: `userId` is only used as an auth gate; it is **not** otherwise used in
  the request (no per-user logging, no DB write from these routes).

  **How the header is populated:** `middleware.ts` runs `clerkMiddleware`. For
  any non-public route it calls `await auth()`, redirects to `/sign-in` if there
  is no `userId`, then forwards the verified id as a request header:

  ```ts
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-clerk-user-id"); // strip any client-supplied value
  requestHeaders.set("x-clerk-user-id", userId);
  return NextResponse.next({ request: { headers: requestHeaders } });
  ```

  The middleware deletes any client-supplied `x-clerk-user-id` first, so the
  header is trustworthy inside the route. Public routes (`/sign-in`, `/sign-up`,
  `/not-invited`, `/api/webhooks/*`) bypass this — but the extraction routes are
  **not** public, so a request can only reach them with a valid header.

### 1.4 Request body / file handling

The body is `multipart/form-data` with a single field named `file`.

```ts
let formData: FormData;
try {
  formData = await req.formData();
} catch {
  return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
}

const file = formData.get("file") as File | null;
if (!file || file.size === 0) {
  return NextResponse.json({ error: "No file provided" }, { status: 400 });
}
```

**File-size limit — 20 MB:**

```ts
if (file.size > 20 * 1024 * 1024) {
  return NextResponse.json(
    { error: "File too large for AI extraction (max 20 MB)" },
    { status: 400 }
  );
}
```

**File-type gate** — accepts PDF (by MIME or `.pdf` extension) or one of the
four supported image MIME types; everything else is rejected:

```ts
const isPdf =
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);

if (!isPdf && !isImage) {
  return NextResponse.json(
    { error: "AI extraction supports PDF and image files only" },
    { status: 400 }
  );
}
```

**Base64 encoding** — the entire file is read into memory and base64-encoded:

```ts
const bytes = await file.arrayBuffer();
const base64 = Buffer.from(bytes).toString("base64");
```

### 1.5 Anthropic content block (document vs. image)

A single content block is built. PDFs use a `document` block; images use an
`image` block. The local TS union type and the construction:

```ts
type ContentBlock =
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    }
  | {
      type: "image";
      source: { type: "base64"; media_type: SupportedImageType; data: string };
    };

const contentBlock: ContentBlock = isPdf
  ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
  : {
      type: "image",
      source: {
        type: "base64",
        media_type: (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)
          ? (file.type as SupportedImageType)
          : "image/jpeg",
        data: base64,
      },
    };
```

- PDF → `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`.
- Image → `{ type: "image", source: { type: "base64", media_type: <file.type>, data } }`,
  falling back to `"image/jpeg"` if the MIME isn't one of the four supported.
  (In practice this fallback is unreachable since a non-image, non-PDF would have
  been rejected earlier, but it satisfies the type narrowing.)

### 1.6 Anthropic API call (shared params)

```ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        contentBlock,
        { type: "text", text: `<PROMPT — see §2 / §3>` },
      ],
    },
  ],
});
```

Key facts for a rebuild:
- **Model:** `"claude-sonnet-4-6"` (hard-coded string literal in both routes).
  This is a **model-version assumption** — the route will break if that model id
  is retired/renamed. No env override.
- **`max_tokens`:** `1024`.
- **No `system` prompt.** All instructions live in the single user-message text
  block. The message `content` array is exactly `[contentBlock, textBlock]` —
  the file block first, then the instruction text.
- **No tools / no JSON-schema tool definitions.** Extraction is **not** done via
  tool-use / structured-output. Claude is simply asked (in prose) to "Return
  ONLY valid JSON," and the route parses free text. There is no
  `tools`/`tool_choice`/`response_format` of any kind.
- **No temperature, no streaming, no prompt caching, no stop sequences** — only
  the four params shown above are passed.

### 1.7 Response parsing & validation

```ts
const text =
  (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)
    ?.text ?? "";

// Strip markdown code fences if present
const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error("No JSON found in AI response");

const extracted = JSON.parse(jsonMatch[0]);
return NextResponse.json({ data: extracted });
```

Parsing steps:
1. Find the **first text block** in `response.content`; default to `""` if none.
2. Strip a leading ```` ``` ```` / ````` ```json ````` fence and a trailing
   ```` ``` ```` fence (multiline regex), then `trim()`.
3. Match the first `{ ... }` span (`/\{[\s\S]*\}/`, greedy). If none, throw
   `"No JSON found in AI response"` → caught → 500.
4. `JSON.parse` the matched substring.

**Validation note:** there is **no schema validation** of the parsed object. The
keys/types are whatever Claude returned. The route trusts the prompt to produce
the right shape; the client/consumer (the form prefill) is responsible for
handling missing or malformed fields. A malformed `JSON.parse` throws and is
caught as a 500.

### 1.8 Success response shape

On success the route returns HTTP 200:

```json
{ "data": { /* the parsed extraction object — see §2.1 / §3.1 */ } }
```

The extracted object is nested under a top-level `data` key.

### 1.9 Error handling summary

| Condition | Status | Body |
|---|---|---|
| Missing `x-clerk-user-id` header | 401 | `{ "error": "Unauthorized" }` |
| `req.formData()` throws | 400 | `{ "error": "Invalid form data" }` |
| No `file` field / empty file | 400 | `{ "error": "No file provided" }` |
| File > 20 MB | 400 | `{ "error": "File too large for AI extraction (max 20 MB)" }` |
| Non-PDF/non-image type | 400 | `{ "error": "AI extraction supports PDF and image files only" }` |
| Anthropic call throws, no JSON in reply, or `JSON.parse` fails | 500 | `{ "error": <err.message or "AI extraction failed"> }` |

The `try/catch` wraps **only** the Anthropic call + parsing block:

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : "AI extraction failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
```

So Anthropic SDK error messages (e.g. rate limits, bad API key) are surfaced
verbatim to the client in the 500 body.

### 1.10 Cost / token logging

**None.** Neither route logs token usage, cost, latency, or the
`response.usage` object. There is no audit-log write from these routes (unlike
the contract/document *save* server actions, which call `insertAuditLog`). The
extraction call is fire-and-discard except for the returned `data`.

---

## 2. `POST /api/extract-contract`

File: `app/api/extract-contract/route.ts`

Everything in §1 applies. The only unique piece is the text prompt.

### 2.1 Full user prompt (verbatim)

The text block appended after `contentBlock`:

```
Extract key terms from this construction contract document. Return a JSON object with these exact fields (use null for any not found):

{
  "vendor_name": "Name of the contractor/vendor party",
  "contract_number": "Contract or agreement number if present",
  "description": "Brief description of the scope of work (1-2 sentences)",
  "original_value": numeric dollar amount of the total contract value (no $ or commas, e.g. 250000),
  "retainage_pct": numeric retainage percentage if stated (e.g. 10 for 10%, null if not found),
  "execution_date": "Contract signing or execution date in YYYY-MM-DD format",
  "substantial_completion_date": "Substantial completion or project end date in YYYY-MM-DD format"
}

For dates, look for phrases like "date of agreement", "signed on", "execution date", "contract date", "substantial completion", "completion date", "project end date". For the contract value, look for "contract sum", "contract price", "total price", "lump sum", "not to exceed". Return ONLY valid JSON with no markdown or explanation.
```

### 2.2 Returned `data` object fields

| Field | Type (per prompt) |
|---|---|
| `vendor_name` | string \| null |
| `contract_number` | string \| null |
| `description` | string \| null |
| `original_value` | number \| null (no `$`/commas) |
| `retainage_pct` | number \| null (e.g. `10` for 10%) |
| `execution_date` | string `YYYY-MM-DD` \| null |
| `substantial_completion_date` | string `YYYY-MM-DD` \| null |

### 2.3 DB mapping → `contracts` table

The extracted object is **not** written to the DB by this route. It prefills the
contract create/edit form; the actual persistence happens in
`app/(dashboard)/projects/[id]/contracts/actions.ts` (`createContract` /
`updateContract`), which reads matching `formData` fields and inserts into the
`contracts` table. The extraction keys line up 1:1 with that payload:

```ts
vendor_name: (formData.get("vendor_name") as string).trim(),
contract_number: (formData.get("contract_number") as string)?.trim() || null,
// description maps to the contract description field
original_value: parseFloat(formData.get("original_value") as string) || 0,
retainage_pct: parseFloat(formData.get("retainage_pct") as string) || 0,
execution_date: (formData.get("execution_date") as string) || null,
substantial_completion_date: (formData.get("substantial_completion_date") as string) || null,
// ...inserted via supabase.from("contracts").insert(payload)
```

So: extraction field → `contracts.<same column name>`. Note the save action
coerces numeric fields with `parseFloat(...) || 0`, so a `null` from extraction
becomes `0` on save.

---

## 3. `POST /api/extract-document`

File: `app/api/extract-document/route.ts`

Everything in §1 applies. The only unique piece is the text prompt. This route
targets Certificate of Insurance (COI) documents.

### 3.1 Full user prompt (verbatim)

The text block appended after `contentBlock`:

```
Extract data from this Certificate of Insurance (COI) document. Return a JSON object with these exact fields (use null for any not found):

{
  "insurer_name": "Name of the insurance company",
  "policy_number": "Policy or certificate number",
  "coverage_type": "One of: General Liability, Workers Compensation, Commercial Auto, Umbrella / Excess, Professional Liability, Builders Risk, Other",
  "effective_date": "Policy start date in YYYY-MM-DD format",
  "expiration_date": "Policy expiration date in YYYY-MM-DD format",
  "per_occurrence_limit": numeric value only (e.g. 1000000),
  "aggregate_limit": numeric value only (e.g. 2000000),
  "additional_insured": true or false,
  "waiver_of_subrogation": true or false
}

For coverage_type, pick the single most prominent coverage. For dollar limits, return numbers only (no $ or commas). Return ONLY valid JSON with no markdown or explanation.
```

### 3.2 Returned `data` object fields

| Field | Type (per prompt) | Notes |
|---|---|---|
| `insurer_name` | string \| null | |
| `policy_number` | string \| null | |
| `coverage_type` | string \| null | One of the 7 enumerated values |
| `effective_date` | string `YYYY-MM-DD` \| null | |
| `expiration_date` | string `YYYY-MM-DD` \| null | |
| `per_occurrence_limit` | number \| null | numbers only |
| `aggregate_limit` | number \| null | numbers only |
| `additional_insured` | boolean \| null | |
| `waiver_of_subrogation` | boolean \| null | |

`coverage_type` enum (exact strings from the prompt): `General Liability`,
`Workers Compensation`, `Commercial Auto`, `Umbrella / Excess`,
`Professional Liability`, `Builders Risk`, `Other`.

### 3.3 DB mapping → `vendor_documents` table

As with §2.3, this route does not persist. The prefill is saved by
`app/(dashboard)/vendors/[name]/actions.ts` (`saveVendorDocument` /
`updateVendorDocument`), which inserts/updates the `vendor_documents` table.
Field mapping (1:1 with the extraction keys):

```ts
supabase.from("vendor_documents").insert({
  insurer_name: insurerName,
  policy_number: policyNumber,
  coverage_type: coverageType,
  per_occurrence_limit: perOccurrenceLimit,
  aggregate_limit: aggregateLimit,
  additional_insured: documentType === "COI" ? additionalInsured : null,
  waiver_of_subrogation: documentType === "COI" ? waiverOfSubrogation : null,
  // effective_date / expiration_date also stored on the row
  // ...plus storage fields (the uploaded file is also saved to a storage bucket)
});
```

Important: `additional_insured` and `waiver_of_subrogation` are only persisted
when the document type is `"COI"`; otherwise the save action stores `null` for
them regardless of what extraction returned. The extraction route itself does
not know the document type — that distinction is applied at save time.

---

## 4. Rebuild checklist

1. Create `app/api/extract-contract/route.ts` and
   `app/api/extract-document/route.ts` as Next.js App Router route handlers
   exporting `async function POST(req: NextRequest)`.
2. Add `@anthropic-ai/sdk` to `dependencies`; instantiate `new Anthropic()` at
   module top level (reads `ANTHROPIC_API_KEY`).
3. Set `ANTHROPIC_API_KEY` in the environment (Vercel project env). Hard
   dependency; no fallback.
4. Implement the shared skeleton (§1.3–§1.9): Clerk header auth, `formData`
   parse, file presence/size(20 MB)/type(PDF + 4 image MIME) gates, base64
   encode, build `document` vs `image` content block.
5. Call `client.messages.create` with `model: "claude-sonnet-4-6"`,
   `max_tokens: 1024`, a single user message whose content is
   `[contentBlock, { type: "text", text: <PROMPT> }]`. No system prompt, no
   tools.
6. Paste the prompt verbatim — §2.1 for contract, §3.1 for COI.
7. Parse: first text block → strip code fences → first `{...}` regex match →
   `JSON.parse` → return `{ data: extracted }`. Throw "No JSON found in AI
   response" if no match.
8. Wrap the call+parse in try/catch returning `{ error: message }` with status
   500.
9. Ensure the Clerk middleware sets `x-clerk-user-id` and these routes are NOT
   in the public-route matcher.

---

## Summary

Both `/api/extract-contract` and `/api/extract-document` are identical POST
handlers that differ only in their prose prompt: Clerk-header auth, a 20 MB
PDF/image upload base64-encoded into a single Anthropic `document`/`image`
content block, sent to `claude-sonnet-4-6` (`max_tokens: 1024`, no system
prompt, no tools) with instructions to return raw JSON, which is then
fence-stripped, regex-matched, `JSON.parse`d, and returned as `{ data }`. The
contract route's fields map to the `contracts` table and the COI route's fields
to `vendor_documents`, but neither route writes the DB — separate server actions
persist the prefilled form, and there is no schema validation or token/cost
logging in either route.

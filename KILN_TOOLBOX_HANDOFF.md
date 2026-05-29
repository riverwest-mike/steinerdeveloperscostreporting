# KILN → Riverwest Toolbox — Integration Handoff

> Prepared for the Toolbox Claude Code session to evaluate folding **KILN**
> (this app — real-estate development financial control system) into the
> Riverwest Toolbox application.
>
> Source repo: `riverwest-mike/steinerdeveloperscostreporting`
> App display name: **KILN** ("Where projects take shape." — by RiverWest)
> Package name: `kiln` (v0.1.0, private)

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

## 9. AppFolio integration

- `lib/appfolio.ts` — V2 Reporting API client, **Basic Auth** (`APPFOLIO_CLIENT_ID:SECRET`
  base64), base `https://${APPFOLIO_DATABASE_URL}/api/v2/reports`, handles pagination
  (`next_page_url`). Pulls `bill_detail.json` (vendor ledger) + balance sheet.
- `lib/appfolio-sync-core.ts` — upserts transactions, parses cost category from raw
  AppFolio strings (e.g. `"010700 Survey"` → code `010700`, name `Survey`), runs
  **gate auto-assignment** (matches `bill_date` to gate date windows) after each sync.
- Triggers: manual (Admin › AppFolio, or on-demand when running PCM/Cost/Vendor reports)
  + daily Vercel cron.

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

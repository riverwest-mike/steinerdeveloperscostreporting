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

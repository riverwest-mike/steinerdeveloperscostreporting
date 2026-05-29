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

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

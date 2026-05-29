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

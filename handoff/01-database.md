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

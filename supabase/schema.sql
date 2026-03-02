-- ============================================================
-- River West Cost Tracker — Full Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Execute the entire script at once.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE 1: users
-- Mirror of Clerk users. id = Clerk user ID (no auto-gen).
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL
                 CHECK (role IN ('admin', 'project_manager', 'read_only')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: projects
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  code                   TEXT NOT NULL UNIQUE,
  appfolio_property_id   TEXT,
  address                TEXT,
  city                   TEXT,
  state                  TEXT,
  property_type          TEXT
                           CHECK (property_type IN ('Multifamily', 'Commercial', 'Mixed-Use', 'Land', 'Other')),
  total_units            INTEGER,
  total_sf               INTEGER,
  acquisition_date       DATE,
  expected_completion    DATE,
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  description            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 3: cost_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  display_order   INTEGER NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 4: project_documents
-- ============================================================
CREATE TABLE IF NOT EXISTS project_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  category     TEXT
                 CHECK (category IN ('Legal', 'Financial', 'Design', 'Other')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 5: project_users  (junction: user ↔ project)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID NOT NULL REFERENCES users(id),
  UNIQUE(project_id, user_id)
);

-- ============================================================
-- TABLE 6: gates
-- ============================================================
CREATE TABLE IF NOT EXISTS gates (
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
  closed_by         UUID REFERENCES users(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  UNIQUE(project_id, sequence_number)
);

-- Only one active gate per project at a time
CREATE UNIQUE INDEX IF NOT EXISTS one_active_gate_per_project
  ON gates(project_id)
  WHERE status = 'active';

-- ============================================================
-- TABLE 7: appfolio_syncs  (must be before appfolio_transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS appfolio_syncs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by        UUID REFERENCES users(id),
  sync_type           TEXT NOT NULL
                        CHECK (sync_type IN ('scheduled', 'manual')),
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  records_fetched     INTEGER,
  records_upserted    INTEGER,
  records_unmapped    INTEGER,
  error_message       TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- ============================================================
-- TABLE 8: budget_imports  (must be before gate_budgets)
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id),
  gate_id       UUID NOT NULL REFERENCES gates(id),
  filename      TEXT NOT NULL,
  row_count     INTEGER NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by   UUID NOT NULL REFERENCES users(id),
  notes         TEXT
);

-- ============================================================
-- TABLE 9: gate_budgets
-- ============================================================
CREATE TABLE IF NOT EXISTS gate_budgets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id               UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  cost_category_id      UUID NOT NULL REFERENCES cost_categories(id),
  original_budget       NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_co_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  revised_budget        NUMERIC(15,2) GENERATED ALWAYS AS (original_budget + approved_co_amount) STORED,
  import_batch_id       UUID REFERENCES budget_imports(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID NOT NULL REFERENCES users(id),
  UNIQUE(gate_id, cost_category_id)
);

-- ============================================================
-- TABLE 10: contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate_id                      UUID NOT NULL REFERENCES gates(id),
  cost_category_id             UUID NOT NULL REFERENCES cost_categories(id),
  vendor_name                  TEXT NOT NULL,
  contract_number              TEXT,
  description                  TEXT NOT NULL,
  original_value               NUMERIC(15,2) NOT NULL,
  approved_co_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  revised_value                NUMERIC(15,2) GENERATED ALWAYS AS (original_value + approved_co_amount) STORED,
  retainage_pct                NUMERIC(5,2) NOT NULL DEFAULT 0,
  execution_date               DATE,
  substantial_completion_date  DATE,
  status                       TEXT NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'complete', 'terminated')),
  teams_url                    TEXT,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                   UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 11: change_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS change_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate_id           UUID NOT NULL REFERENCES gates(id),
  contract_id       UUID REFERENCES contracts(id),
  cost_category_id  UUID NOT NULL REFERENCES cost_categories(id),
  co_number         TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed', 'approved', 'rejected', 'voided')),
  proposed_date     DATE NOT NULL,
  approved_date     DATE,
  approved_by       UUID REFERENCES users(id),
  teams_url         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 12: appfolio_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS appfolio_transactions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_bill_id       TEXT NOT NULL UNIQUE,
  appfolio_property_id   TEXT NOT NULL,
  vendor_name            TEXT NOT NULL,
  gl_account_id          TEXT NOT NULL,
  gl_account_name        TEXT NOT NULL,
  bill_date              DATE,
  due_date               DATE,
  payment_date           DATE,
  invoice_amount         NUMERIC(15,2) NOT NULL,
  paid_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
  unpaid_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_type           TEXT,
  check_number           TEXT,
  payment_status         TEXT NOT NULL,
  reference_number       TEXT,
  description            TEXT,
  property_name          TEXT,
  sync_id                UUID NOT NULL REFERENCES appfolio_syncs(id),
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appfolio_transactions_property ON appfolio_transactions(appfolio_property_id);
CREATE INDEX IF NOT EXISTS idx_appfolio_transactions_bill_date ON appfolio_transactions(bill_date);
CREATE INDEX IF NOT EXISTS idx_appfolio_transactions_vendor ON appfolio_transactions(vendor_name);

-- ============================================================
-- TABLE 13: bridge_mappings
-- ============================================================
CREATE TABLE IF NOT EXISTS bridge_mappings (
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
  created_by            UUID NOT NULL REFERENCES users(id),
  updated_by            UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bridge_mappings_project ON bridge_mappings(project_id);

-- ============================================================
-- TABLE 14: transaction_mappings
-- ============================================================
CREATE TABLE IF NOT EXISTS transaction_mappings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_transaction_id   UUID NOT NULL UNIQUE REFERENCES appfolio_transactions(id),
  project_id                UUID NOT NULL REFERENCES projects(id),
  gate_id                   UUID NOT NULL REFERENCES gates(id),
  cost_category_id          UUID NOT NULL REFERENCES cost_categories(id),
  contract_id               UUID REFERENCES contracts(id),
  bridge_mapping_id         UUID REFERENCES bridge_mappings(id),
  mapped_amount             NUMERIC(15,2) NOT NULL,
  retainage_held            NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount                NUMERIC(15,2) GENERATED ALWAYS AS (mapped_amount - retainage_held) STORED,
  is_override               BOOLEAN NOT NULL DEFAULT false,
  override_reason           TEXT,
  mapped_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_by                 UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_mappings_project ON transaction_mappings(project_id);
CREATE INDEX IF NOT EXISTS idx_transaction_mappings_gate ON transaction_mappings(gate_id);
CREATE INDEX IF NOT EXISTS idx_transaction_mappings_category ON transaction_mappings(cost_category_id);

-- ============================================================
-- TABLE 15: retainage_releases
-- ============================================================
CREATE TABLE IF NOT EXISTS retainage_releases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id),
  release_date   DATE NOT NULL,
  amount         NUMERIC(15,2) NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID NOT NULL REFERENCES users(id)
);

-- ============================================================
-- TABLE 16: audit_log  (immutable — no UPDATE/DELETE RLS policy)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL
                 CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name   TEXT NOT NULL,
  record_id    UUID NOT NULL,
  project_id   UUID,
  old_data     JSONB,
  new_data     JSONB,
  ip_address   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred ON audit_log(occurred_at DESC);

-- ============================================================
-- TABLE 17: gl_balances
-- ============================================================
CREATE TABLE IF NOT EXISTS gl_balances (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_property_id   TEXT NOT NULL,
  project_id             UUID REFERENCES projects(id),
  gl_account_id          TEXT NOT NULL,
  gl_account_name        TEXT NOT NULL,
  gl_account_number      TEXT,
  account_type           TEXT NOT NULL,
  balance                NUMERIC(15,2) NOT NULL,
  as_of_date             DATE NOT NULL,
  accounting_basis       TEXT NOT NULL
                           CHECK (accounting_basis IN ('Cash', 'Accrual')),
  sync_id                UUID NOT NULL REFERENCES appfolio_syncs(id),
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(appfolio_property_id, gl_account_id, as_of_date, accounting_basis)
);

CREATE INDEX IF NOT EXISTS idx_gl_balances_property_date ON gl_balances(appfolio_property_id, as_of_date);

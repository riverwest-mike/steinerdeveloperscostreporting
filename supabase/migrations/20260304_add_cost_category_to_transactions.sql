-- ============================================================
-- Migration: Add cost_category_code / cost_category_name to
--            appfolio_transactions.
--
-- Run this in Supabase SQL Editor before re-syncing AppFolio data.
-- The sync now uses vendor_ledger.json which returns the Project
-- Cost Category field (e.g. "010700 Survey").
-- ============================================================

ALTER TABLE appfolio_transactions
  ADD COLUMN IF NOT EXISTS cost_category_code TEXT,
  ADD COLUMN IF NOT EXISTS cost_category_name TEXT;

-- Allow gl_account_id / gl_account_name to be blank (vendor_ledger
-- may not always return a separate GL account number)
ALTER TABLE appfolio_transactions
  ALTER COLUMN gl_account_id SET DEFAULT '',
  ALTER COLUMN gl_account_name SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_appfolio_transactions_cost_code
  ON appfolio_transactions(cost_category_code);

-- Manual cost category override for AppFolio transactions.
-- When set, the sync will preserve these values rather than overwriting from AppFolio.
ALTER TABLE appfolio_transactions
  ADD COLUMN IF NOT EXISTS cost_category_code_override TEXT,
  ADD COLUMN IF NOT EXISTS cost_category_name_override TEXT,
  ADD COLUMN IF NOT EXISTS cost_category_override_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_category_override_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS appfolio_transactions_category_override_idx
  ON appfolio_transactions (cost_category_code_override)
  WHERE cost_category_code_override IS NOT NULL;

-- ============================================================
-- contract_line_items: Schedule of Values (SOV) breakdown
-- Allows a single contract to distribute its value across
-- multiple cost codes. When line items exist on a contract,
-- the PCM Report uses them (instead of the contract's single
-- cost_category_id) to attribute committed amounts per cost code.
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  cost_category_id UUID NOT NULL REFERENCES cost_categories(id),
  description      TEXT,
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cli_contract ON contract_line_items(contract_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

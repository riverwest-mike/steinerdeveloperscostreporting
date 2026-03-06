-- Change order enhancements
-- 1. rejection_reason: captured when a CO is rejected
-- 2. contract_id is already nullable (budget-level COs have no contract)

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

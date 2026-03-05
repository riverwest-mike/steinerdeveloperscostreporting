-- ============================================================
-- contract_gates: many-to-many between contracts and gates
-- A single contract may span multiple project gates/phases.
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_gates (
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  gate_id     UUID NOT NULL REFERENCES gates(id)     ON DELETE CASCADE,
  PRIMARY KEY (contract_id, gate_id)
);

-- Migrate every existing single-gate association into the junction table
INSERT INTO contract_gates (contract_id, gate_id)
SELECT id, gate_id
FROM contracts
WHERE gate_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- contracts.gate_id is now a nullable fallback used only as the
-- default gate when creating a change order on a multi-gate contract.
ALTER TABLE contracts ALTER COLUMN gate_id DROP NOT NULL;

-- Reload PostgREST schema cache so the new table is immediately visible
NOTIFY pgrst, 'reload schema';

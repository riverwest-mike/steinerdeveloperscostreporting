-- ============================================================
-- TABLE: transaction_gate_assignments
-- Lightweight gate assignment for AppFolio transactions.
-- Auto-populated during sync based on bill_date vs gate date
-- windows. Can be manually overridden by admin/PM users.
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_gate_assignments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_transaction_id UUID NOT NULL UNIQUE REFERENCES appfolio_transactions(id) ON DELETE CASCADE,
  gate_id                 UUID NOT NULL REFERENCES gates(id),
  is_override             BOOLEAN NOT NULL DEFAULT false,
  assigned_by             TEXT REFERENCES users(id),
  assigned_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tga_gate ON transaction_gate_assignments(gate_id);
CREATE INDEX IF NOT EXISTS idx_tga_transaction ON transaction_gate_assignments(appfolio_transaction_id);

-- RLS: admins and assigned users can read/write
ALTER TABLE transaction_gate_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on tga"
  ON transaction_gate_assignments
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "PMs and read-only can read tga"
  ON transaction_gate_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "PMs can insert/update tga"
  ON transaction_gate_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.jwt() ->> 'sub'
        AND u.role IN ('admin', 'project_manager')
    )
  );

CREATE POLICY "PMs can update tga"
  ON transaction_gate_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.jwt() ->> 'sub'
        AND u.role IN ('admin', 'project_manager')
    )
  );

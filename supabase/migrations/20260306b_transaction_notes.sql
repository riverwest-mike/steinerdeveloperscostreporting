-- Permanent user notes on AppFolio transactions.
-- Keyed on appfolio_bill_id (not the UUID id) so notes survive re-syncs.
CREATE TABLE IF NOT EXISTS transaction_notes (
  appfolio_bill_id TEXT PRIMARY KEY
    REFERENCES appfolio_transactions(appfolio_bill_id) ON DELETE CASCADE,
  note             TEXT NOT NULL DEFAULT '',
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow authenticated users to read/write their own notes
ALTER TABLE transaction_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_transaction_notes" ON transaction_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','pm','read_only'))
  );

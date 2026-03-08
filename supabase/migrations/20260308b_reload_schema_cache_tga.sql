-- Notify PostgREST to reload its schema cache so it picks up the
-- transaction_gate_assignments table created in the previous migration.
NOTIFY pgrst, 'reload schema';

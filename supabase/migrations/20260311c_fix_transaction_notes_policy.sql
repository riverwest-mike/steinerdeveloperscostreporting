-- ============================================================
-- Fix transaction_notes RLS policy
--
-- The original policy had three bugs:
--   1. Used 'pm' instead of the valid role name 'project_manager'
--      (PMs silently had no access to transaction notes)
--   2. Granted FOR ALL (write) access to 'read_only' users
--      (read_only role should never write data)
--   3. Missing 'accounting' role (added in 20260310e)
-- ============================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "admins_all_transaction_notes" ON transaction_notes;

-- Admin, Accounting, PM: full read + write access
CREATE POLICY "admin_accounting_pm_all_transaction_notes"
  ON transaction_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::TEXT
        AND role IN ('admin', 'accounting', 'project_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::TEXT
        AND role IN ('admin', 'accounting', 'project_manager')
    )
  );

-- Read Only: select only
CREATE POLICY "ro_select_transaction_notes"
  ON transaction_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()::TEXT AND role = 'read_only'
    )
  );

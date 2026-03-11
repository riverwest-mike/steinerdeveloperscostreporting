-- ============================================================
-- Security Advisor Fixes
-- Resolves all 4 errors and 3 warnings from the Supabase
-- Security Advisor dashboard.
--
-- Errors fixed (RLS Disabled in Public):
--   • public.pending_project_assignments
--   • public.contract_gates
--   • public.contract_line_items
--   • public.audit_logs
--
-- Warnings fixed (Function Search Path Mutable):
--   • public.get_my_role
--   • public.is_admin
--   • public.is_assigned_to_project
-- ============================================================


-- ── 1. Fix SECURITY DEFINER functions ─────────────────────────
-- Without SET search_path = '', a malicious schema could shadow
-- public.users / public.project_users and bypass auth checks.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE id = (auth.jwt() ->> 'sub');
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (auth.jwt() ->> 'sub') AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_assigned_to_project(proj_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_users
    WHERE project_id = proj_id AND user_id = (auth.jwt() ->> 'sub')
  );
$$;


-- ── 2. pending_project_assignments ────────────────────────────
-- Contains pending invite emails + project assignments.
-- Admin-only: used exclusively in server-side invite flows.

ALTER TABLE pending_project_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_pending_project_assignments"
  ON pending_project_assignments
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ── 3. contract_gates ─────────────────────────────────────────
-- Junction table (contract ↔ gate). Visibility mirrors contracts.

ALTER TABLE contract_gates ENABLE ROW LEVEL SECURITY;

-- Admin + Accounting: full access
CREATE POLICY "admin_accounting_all_contract_gates"
  ON contract_gates
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'accounting'))
  WITH CHECK (get_my_role() IN ('admin', 'accounting'));

-- PM: full access for contracts on assigned projects
CREATE POLICY "pm_all_assigned_contract_gates"
  ON contract_gates
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  )
  WITH CHECK (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  );

-- Read Only: select for contracts on assigned projects
CREATE POLICY "ro_select_assigned_contract_gates"
  ON contract_gates
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  );


-- ── 4. contract_line_items ────────────────────────────────────
-- Schedule of Values rows. Visibility mirrors parent contract.

ALTER TABLE contract_line_items ENABLE ROW LEVEL SECURITY;

-- Admin + Accounting: full access
CREATE POLICY "admin_accounting_all_contract_line_items"
  ON contract_line_items
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'accounting'))
  WITH CHECK (get_my_role() IN ('admin', 'accounting'));

-- PM: full access for contracts on assigned projects
CREATE POLICY "pm_all_assigned_contract_line_items"
  ON contract_line_items
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  )
  WITH CHECK (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  );

-- Read Only: select for contracts on assigned projects
CREATE POLICY "ro_select_assigned_contract_line_items"
  ON contract_line_items
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND is_assigned_to_project(c.project_id)
    )
  );


-- ── 5. audit_logs ─────────────────────────────────────────────
-- All inserts come from createAdminClient() (service role), which
-- bypasses RLS — no INSERT policy needed for authenticated users.

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin + Accounting: read access
CREATE POLICY "admin_accounting_select_audit_logs"
  ON audit_logs
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'accounting'));

-- ============================================================
-- River West Cost Tracker — Row Level Security Policies
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- These run with SECURITY DEFINER so they can read the users
-- table even when RLS is active on it.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_assigned_to_project(proj_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = proj_id AND user_id = auth.uid()
  );
$$;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_imports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appfolio_syncs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appfolio_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE retainage_releases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_balances          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- users table
-- ============================================================
-- Admins: full access
CREATE POLICY "admin_all_users" ON users
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Everyone: can read their own record
CREATE POLICY "self_read_users" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- projects table
-- ============================================================
CREATE POLICY "admin_all_projects" ON projects
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_assigned_projects" ON projects
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(id)
  );

CREATE POLICY "pm_update_assigned_projects" ON projects
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(id)
  );

CREATE POLICY "ro_select_assigned_projects" ON projects
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(id)
  );

-- ============================================================
-- cost_categories table  (admin only for write; all auth can read)
-- ============================================================
CREATE POLICY "admin_all_cost_categories" ON cost_categories
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "authenticated_read_cost_categories" ON cost_categories
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- project_documents table
-- ============================================================
CREATE POLICY "admin_all_project_documents" ON project_documents
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_all_assigned_project_documents" ON project_documents
  FOR ALL TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  )
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_project_documents" ON project_documents
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- project_users table  (admin manages; users can see their own)
-- ============================================================
CREATE POLICY "admin_all_project_users" ON project_users
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "self_read_project_users" ON project_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- gates table
-- ============================================================
CREATE POLICY "admin_all_gates" ON gates
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_assigned_gates" ON gates
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_gates" ON gates
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- budget_imports table
-- ============================================================
CREATE POLICY "admin_all_budget_imports" ON budget_imports
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_insert_budget_imports" ON budget_imports
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_select_assigned_budget_imports" ON budget_imports
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_budget_imports" ON budget_imports
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- gate_budgets table
-- ============================================================
CREATE POLICY "admin_all_gate_budgets" ON gate_budgets
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_write_assigned_gate_budgets" ON gate_budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager'
    AND EXISTS (
      SELECT 1 FROM gates g WHERE g.id = gate_id AND is_assigned_to_project(g.project_id)
    )
  );

CREATE POLICY "pm_select_assigned_gate_budgets" ON gate_budgets
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager'
    AND EXISTS (
      SELECT 1 FROM gates g WHERE g.id = gate_id AND is_assigned_to_project(g.project_id)
    )
  );

CREATE POLICY "ro_select_assigned_gate_budgets" ON gate_budgets
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only'
    AND EXISTS (
      SELECT 1 FROM gates g WHERE g.id = gate_id AND is_assigned_to_project(g.project_id)
    )
  );

-- ============================================================
-- contracts table
-- ============================================================
CREATE POLICY "admin_all_contracts" ON contracts
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_write_assigned_contracts" ON contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_update_assigned_contracts" ON contracts
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_select_assigned_contracts" ON contracts
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_contracts" ON contracts
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- change_orders table
-- ============================================================
CREATE POLICY "admin_all_change_orders" ON change_orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_write_assigned_change_orders" ON change_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_update_assigned_change_orders" ON change_orders
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_select_assigned_change_orders" ON change_orders
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_change_orders" ON change_orders
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- appfolio_syncs table
-- ============================================================
CREATE POLICY "admin_all_appfolio_syncs" ON appfolio_syncs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_appfolio_syncs" ON appfolio_syncs
  FOR SELECT TO authenticated
  USING (get_my_role() = 'project_manager');

-- ============================================================
-- appfolio_transactions table
-- ============================================================
CREATE POLICY "admin_all_appfolio_transactions" ON appfolio_transactions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_assigned_appfolio_transactions" ON appfolio_transactions
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.appfolio_property_id = appfolio_transactions.appfolio_property_id
        AND is_assigned_to_project(p.id)
    )
  );

CREATE POLICY "ro_select_assigned_appfolio_transactions" ON appfolio_transactions
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.appfolio_property_id = appfolio_transactions.appfolio_property_id
        AND is_assigned_to_project(p.id)
    )
  );

-- ============================================================
-- bridge_mappings table  (admin only)
-- ============================================================
CREATE POLICY "admin_all_bridge_mappings" ON bridge_mappings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- transaction_mappings table
-- ============================================================
CREATE POLICY "admin_all_transaction_mappings" ON transaction_mappings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_assigned_transaction_mappings" ON transaction_mappings
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_transaction_mappings" ON transaction_mappings
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- retainage_releases table
-- ============================================================
CREATE POLICY "admin_all_retainage_releases" ON retainage_releases
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_write_assigned_retainage_releases" ON retainage_releases
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_select_assigned_retainage_releases" ON retainage_releases
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "ro_select_assigned_retainage_releases" ON retainage_releases
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- ============================================================
-- audit_log table  (INSERT only — no UPDATE or DELETE for anyone)
-- ============================================================
CREATE POLICY "admin_select_audit_log" ON audit_log
  FOR SELECT TO authenticated
  USING (is_admin());

-- Service role (used by webhooks/cron) can insert via createAdminClient
-- which bypasses RLS — no INSERT policy needed for authenticated users
-- since audit writes come from server-side trusted contexts.

-- ============================================================
-- gl_balances table
-- ============================================================
CREATE POLICY "admin_all_gl_balances" ON gl_balances
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "pm_select_assigned_gl_balances" ON gl_balances
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager'
    AND (
      project_id IS NULL
      OR is_assigned_to_project(project_id)
    )
  );

CREATE POLICY "ro_select_assigned_gl_balances" ON gl_balances
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only'
    AND (
      project_id IS NULL
      OR is_assigned_to_project(project_id)
    )
  );

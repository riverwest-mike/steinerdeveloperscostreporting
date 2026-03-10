-- ============================================================
-- Draw Requests
-- Add lender field to projects; create draw_requests and
-- draw_request_lines tables with RLS policies.
-- ============================================================

-- 1. Add lender to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lender TEXT;

-- 2. draw_requests table
CREATE TABLE IF NOT EXISTS draw_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draw_number     INTEGER NOT NULL,
  title           TEXT,
  submission_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  lender          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL REFERENCES users(id),
  UNIQUE(project_id, draw_number)
);

-- 3. draw_request_lines table (one row per cost category per draw)
CREATE TABLE IF NOT EXISTS draw_request_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_request_id   UUID NOT NULL REFERENCES draw_requests(id) ON DELETE CASCADE,
  cost_category_id  UUID NOT NULL REFERENCES cost_categories(id),
  this_draw_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_request_id, cost_category_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_draw_requests_project ON draw_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_draw_request_lines_draw ON draw_request_lines(draw_request_id);

-- 5. RLS
ALTER TABLE draw_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_request_lines ENABLE ROW LEVEL SECURITY;

-- Helper: reuse existing get_my_role() and is_assigned_to_project() functions

-- draw_requests policies
-- Admin / Accounting: full access to all
CREATE POLICY "admin_accounting_all_draw_requests" ON draw_requests
  FOR ALL TO authenticated
  USING (
    get_my_role() IN ('admin', 'accounting')
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'accounting')
  );

-- Project Manager: read + write for assigned projects
CREATE POLICY "pm_select_draw_requests" ON draw_requests
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_insert_draw_requests" ON draw_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_update_draw_requests" ON draw_requests
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

CREATE POLICY "pm_delete_draw_requests" ON draw_requests
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND is_assigned_to_project(project_id)
  );

-- Read Only: select only for assigned projects
CREATE POLICY "ro_select_draw_requests" ON draw_requests
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND is_assigned_to_project(project_id)
  );

-- draw_request_lines policies (mirror draw_requests via project_id join)
CREATE POLICY "admin_accounting_all_draw_lines" ON draw_request_lines
  FOR ALL TO authenticated
  USING (
    get_my_role() IN ('admin', 'accounting')
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'accounting')
  );

CREATE POLICY "pm_select_draw_lines" ON draw_request_lines
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM draw_requests dr
      WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id)
    )
  );

CREATE POLICY "pm_insert_draw_lines" ON draw_request_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM draw_requests dr
      WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id)
    )
  );

CREATE POLICY "pm_update_draw_lines" ON draw_request_lines
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM draw_requests dr
      WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id)
    )
  );

CREATE POLICY "pm_delete_draw_lines" ON draw_request_lines
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'project_manager' AND EXISTS (
      SELECT 1 FROM draw_requests dr
      WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id)
    )
  );

CREATE POLICY "ro_select_draw_lines" ON draw_request_lines
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'read_only' AND EXISTS (
      SELECT 1 FROM draw_requests dr
      WHERE dr.id = draw_request_id AND is_assigned_to_project(dr.project_id)
    )
  );

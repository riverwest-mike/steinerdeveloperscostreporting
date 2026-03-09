-- ============================================================
-- Project Vendor Directory
-- A project-scoped, name-keyed list of vendors.
-- Auto-populated during AppFolio sync; also populated from
-- existing contracts. Users identify vendors by name (not ID).
-- ============================================================

CREATE TABLE IF NOT EXISTS project_vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT REFERENCES users(id),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_project_vendors_project ON project_vendors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_vendors_name ON project_vendors(project_id, name);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE project_vendors ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access on project_vendors"
  ON project_vendors
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = (auth.jwt() ->> 'sub') AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = (auth.jwt() ->> 'sub') AND u.role = 'admin')
  );

-- All authenticated users: read
CREATE POLICY "Authenticated users can read project_vendors"
  ON project_vendors
  FOR SELECT
  TO authenticated
  USING (true);

-- Project managers: can insert new vendors
CREATE POLICY "PMs can insert project_vendors"
  ON project_vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (auth.jwt() ->> 'sub')
        AND u.role IN ('admin', 'project_manager')
    )
  );

-- Project managers: can update vendors
CREATE POLICY "PMs can update project_vendors"
  ON project_vendors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (auth.jwt() ->> 'sub')
        AND u.role IN ('admin', 'project_manager')
    )
  );

-- ── Data migration: populate from existing data ───────────────
-- Pull unique vendor names from contracts (project_id known directly)
INSERT INTO project_vendors (project_id, name)
SELECT DISTINCT project_id, vendor_name
FROM contracts
WHERE vendor_name IS NOT NULL AND vendor_name <> ''
ON CONFLICT (project_id, name) DO NOTHING;

-- Pull unique vendor names from appfolio_transactions via property→project mapping
INSERT INTO project_vendors (project_id, name)
SELECT DISTINCT p.id AS project_id, t.vendor_name
FROM appfolio_transactions t
JOIN projects p ON p.appfolio_property_id = t.appfolio_property_id
WHERE t.vendor_name IS NOT NULL AND t.vendor_name <> ''
  AND p.appfolio_property_id IS NOT NULL
  AND p.appfolio_property_id <> ''
ON CONFLICT (project_id, name) DO NOTHING;

-- ── Reload schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

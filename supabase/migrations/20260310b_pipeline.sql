-- ============================================================
-- Pipeline Module — stage tracking for development projects
-- Run this in the Supabase SQL Editor.
--
-- Adds pipeline_stage + financial fields to projects, and
-- creates a project_stage_history table for full audit trail.
-- ============================================================

-- ── Pipeline columns on projects ─────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pipeline_stage            text        NOT NULL DEFAULT 'construction',
  ADD COLUMN IF NOT EXISTS pipeline_stage_entered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS acquisition_price         numeric,
  ADD COLUMN IF NOT EXISTS equity_invested           numeric,
  ADD COLUMN IF NOT EXISTS projected_total_cost      numeric;

-- Enforce valid stage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'projects'
      AND constraint_name = 'projects_pipeline_stage_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_pipeline_stage_check
      CHECK (pipeline_stage IN (
        'prospect',
        'under_contract',
        'pre_development',
        'construction',
        'lease_up',
        'stabilized',
        'disposed'
      ));
  END IF;
END $$;

-- Index for fast pipeline board queries
CREATE INDEX IF NOT EXISTS idx_projects_pipeline_stage
  ON projects (pipeline_stage);

-- ── Stage history ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_stage_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_stage  text,
  to_stage    text        NOT NULL,
  changed_by  text        REFERENCES users(id),
  notes       text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_history_project
  ON project_stage_history (project_id, changed_at DESC);

ALTER TABLE project_stage_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read history
DROP POLICY IF EXISTS "auth_read_stage_history" ON project_stage_history;
CREATE POLICY "auth_read_stage_history"
  ON project_stage_history FOR SELECT TO authenticated
  USING (true);

-- Admins and PMs can insert history records
DROP POLICY IF EXISTS "pm_admin_insert_stage_history" ON project_stage_history;
CREATE POLICY "pm_admin_insert_stage_history"
  ON project_stage_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
        AND users.role IN ('admin', 'project_manager')
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

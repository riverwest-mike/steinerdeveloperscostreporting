-- ============================================================
-- Add Project Manager (PM) assignment to projects
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pm_user_id TEXT REFERENCES users(id);

-- ── Reload schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

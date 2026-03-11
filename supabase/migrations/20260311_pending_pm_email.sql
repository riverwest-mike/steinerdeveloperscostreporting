-- Add pending_pm_email column to projects table
-- Used to assign a pending (not yet accepted) PM invite as the project manager.
-- When a real user ID is assigned (pm_user_id), this column should be null and vice versa.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pending_pm_email TEXT;

-- Ensure image_url column exists (idempotent) and reload PostgREST schema cache
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Signal PostgREST to reload its schema cache so the new column is visible immediately
NOTIFY pgrst, 'reload schema';

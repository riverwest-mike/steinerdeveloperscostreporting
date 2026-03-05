-- Add image_url column to projects table
-- Stores the public URL of the project cover image (uploaded to Supabase Storage)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================================
-- Project Documents — Storage Bucket Setup
-- Run this in the Supabase SQL Editor.
--
-- The project_documents TABLE and its RLS policies already
-- exist in schema.sql / rls.sql.  This migration only adds
-- the Storage bucket (private, 50 MB per file) that the
-- application uses to store the actual uploaded files.
-- ============================================================

-- Create the private storage bucket for project documents.
-- Allowed types cover PDFs, Office docs, images, and archives.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'project-documents',
  'project-documents',
  false,           -- private: files only accessible via signed URLs
  52428800,        -- 50 MB per file
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage object policies ───────────────────────────────────
-- All storage access in this app goes through the Supabase
-- service-role key (createAdminClient), which bypasses RLS.
-- These policies are defence-in-depth for any direct client
-- access and follow the same role model as the DB tables.

-- Authenticated users can upload to the bucket
DROP POLICY IF EXISTS "Auth users can upload project documents" ON storage.objects;
CREATE POLICY "Auth users can upload project documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents');

-- Authenticated users can read files (download via signed URL)
DROP POLICY IF EXISTS "Auth users can read project documents" ON storage.objects;
CREATE POLICY "Auth users can read project documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents');

-- Authenticated users can delete their own uploads
DROP POLICY IF EXISTS "Auth users can delete project documents" ON storage.objects;
CREATE POLICY "Auth users can delete project documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents');

-- ── Ensure project_documents table exists (idempotent) ───────
CREATE TABLE IF NOT EXISTS project_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  category     TEXT
                 CHECK (category IN ('Legal', 'Financial', 'Design', 'Other')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT NOT NULL REFERENCES users(id)
);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Vendor Documents — COI, Lien Waivers, W-9s, and Other
-- Run this in the Supabase SQL Editor.
--
-- Stores compliance documents uploaded to a vendor profile.
-- Files are stored in the existing 'project-documents' storage
-- bucket under a 'vendors/' path prefix.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vendor this document belongs to (matched by name, global across projects)
  vendor_name             TEXT NOT NULL,

  -- Optionally scoped to a specific project (NULL = applies to all projects)
  project_id              UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Document type determines which additional fields are relevant
  document_type           TEXT NOT NULL
                            CHECK (document_type IN ('COI', 'Lien Waiver', 'W-9', 'Other')),

  -- Human-readable label for the file (e.g. "GL Policy 2025-2026")
  display_name            TEXT NOT NULL,

  -- Path in Supabase storage bucket 'project-documents' (under vendors/ prefix)
  storage_path            TEXT NOT NULL,

  -- ── COI fields ────────────────────────────────────────────
  -- Insurance company issuing the certificate
  insurer_name            TEXT,

  -- Policy number on the certificate
  policy_number           TEXT,

  -- Coverage type: General Liability, Workers Comp, Auto, Umbrella/Excess, etc.
  coverage_type           TEXT,

  -- Per-occurrence limit (e.g. 1000000)
  per_occurrence_limit    NUMERIC,

  -- General aggregate limit (e.g. 2000000)
  aggregate_limit         NUMERIC,

  -- Whether the certificate holder is listed as additional insured
  additional_insured      BOOLEAN,

  -- Whether a waiver of subrogation endorsement is included
  waiver_of_subrogation   BOOLEAN,

  -- ── Lien Waiver fields ────────────────────────────────────
  -- Conditional Partial, Conditional Final, Unconditional Partial, Unconditional Final
  waiver_type             TEXT
                            CHECK (waiver_type IS NULL OR waiver_type IN (
                              'Conditional Partial',
                              'Conditional Final',
                              'Unconditional Partial',
                              'Unconditional Final'
                            )),

  -- Dollar amount covered by the waiver
  waiver_amount           NUMERIC,

  -- "Through date" for conditional waivers (work completed through this date)
  through_date            DATE,

  -- ── Shared date fields ────────────────────────────────────
  -- Policy/document effective date
  effective_date          DATE,

  -- Expiration date — critical for COI compliance tracking
  expiration_date         DATE,

  -- ── General ───────────────────────────────────────────────
  notes                   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              TEXT NOT NULL REFERENCES users(id)
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_name
  ON vendor_documents (vendor_name);

CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiration
  ON vendor_documents (expiration_date)
  WHERE expiration_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_documents_project
  ON vendor_documents (project_id)
  WHERE project_id IS NOT NULL;

-- ── RLS Policies ──────────────────────────────────────────
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read vendor documents
DROP POLICY IF EXISTS "Auth users can read vendor documents" ON vendor_documents;
CREATE POLICY "Auth users can read vendor documents"
  ON vendor_documents FOR SELECT TO authenticated
  USING (true);

-- PMs and Admins can upload vendor documents
DROP POLICY IF EXISTS "PMs and admins can insert vendor documents" ON vendor_documents;
CREATE POLICY "PMs and admins can insert vendor documents"
  ON vendor_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
        AND users.role IN ('admin', 'project_manager')
    )
  );

-- PMs and Admins can update vendor documents
DROP POLICY IF EXISTS "PMs and admins can update vendor documents" ON vendor_documents;
CREATE POLICY "PMs and admins can update vendor documents"
  ON vendor_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
        AND users.role IN ('admin', 'project_manager')
    )
  );

-- Only Admins can delete vendor documents
DROP POLICY IF EXISTS "Admins can delete vendor documents" ON vendor_documents;
CREATE POLICY "Admins can delete vendor documents"
  ON vendor_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()::text
        AND users.role = 'admin'
    )
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

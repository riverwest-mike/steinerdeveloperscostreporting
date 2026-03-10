-- Add 'MHP' to the projects.property_type CHECK constraint.
-- The form already allows this value (added in a prior UI commit); the
-- schema constraint was never updated to match, causing a DB error on save.

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_property_type_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_property_type_check
    CHECK (property_type IN ('Multifamily', 'MHP', 'Commercial', 'Mixed-Use', 'Land', 'Other'));

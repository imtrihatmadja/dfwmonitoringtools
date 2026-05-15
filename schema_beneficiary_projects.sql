-- ================================================================
-- MIGRATION: Tambah tabel beneficiary_projects
-- Jalankan di Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS beneficiary_projects (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid        REFERENCES beneficiaries(id) ON DELETE CASCADE,
  project_name   text        NOT NULL,
  project_id     uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(beneficiary_id, project_name)
);

ALTER TABLE beneficiary_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON beneficiary_projects;
CREATE POLICY "allow_all" ON beneficiary_projects FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bp_beneficiary_id ON beneficiary_projects(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_bp_project_name   ON beneficiary_projects(project_name);

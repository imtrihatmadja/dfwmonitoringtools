-- ================================================================
-- SCHEMA PMIS v5 (Tahap 1 Foundation) — PERBAIKAN
-- 
-- CARA MENJALANKAN:
--   Jalankan SATU SEKSI sekaligus di SQL Editor Supabase.
--   Seksi A → Run → tunggu sukses → Seksi B → Run → Seksi C → Run
-- ================================================================

-- ----------------------------------------------------------------
-- SEKSI A: Soft-delete & project_id di tabel turunan
-- ----------------------------------------------------------------

-- A0. Perbaiki fungsi set_updated_at agar aman di semua tabel
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      NEW.updated_at = now();
    EXCEPTION WHEN undefined_column THEN
      -- tabel ini tidak punya kolom updated_at, abaikan
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- A1. Tambah kolom archived ke tabel projects
-- (jika kolom sudah ada tapi nilainya NULL, update ke false)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived    boolean     NOT NULL DEFAULT false;
-- Pastikan semua proyek lama nilainya false (bukan NULL)
UPDATE projects SET archived = false WHERE archived IS NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by text;

-- A2. Tambah kolom project_id ke tabel turunan (backward-compatible)
ALTER TABLE project_indicators ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE indicator_updates  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE indicator_evidence ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE activity_notes     ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE activity_files     ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE budget_updates     ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_outcomes   ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- A3. Back-fill project_id dari data yang sudah ada
UPDATE project_indicators  pi SET project_id = p.id FROM projects p WHERE p.name = pi.project_name AND pi.project_id IS NULL;
UPDATE indicator_updates   iu SET project_id = p.id FROM projects p WHERE p.name = iu.project_name AND iu.project_id IS NULL;
UPDATE indicator_evidence  ie SET project_id = p.id FROM projects p WHERE p.name = ie.project_name AND ie.project_id IS NULL;
UPDATE project_activities  pa SET project_id = p.id FROM projects p WHERE p.name = pa.project_name AND pa.project_id IS NULL;
UPDATE activity_notes      an SET project_id = p.id FROM projects p WHERE p.name = an.project_name AND an.project_id IS NULL;
UPDATE activity_files      af SET project_id = p.id FROM projects p WHERE p.name = af.project_name AND af.project_id IS NULL;
UPDATE budget_updates      bu SET project_id = p.id FROM projects p WHERE p.name = bu.project_name AND bu.project_id IS NULL;
UPDATE project_outcomes    po SET project_id = p.id FROM projects p WHERE p.name = po.project_name AND po.project_id IS NULL;

-- A4. Index performa
CREATE INDEX IF NOT EXISTS idx_pi_project_id     ON project_indicators(project_id);
CREATE INDEX IF NOT EXISTS idx_pa_project_id     ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_iu_project_id     ON indicator_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_po_project_id     ON project_outcomes(project_id);
CREATE INDEX IF NOT EXISTS idx_bu_project_id     ON budget_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);


-- ----------------------------------------------------------------
-- SEKSI B: Tabel audit_log
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid        REFERENCES projects(id) ON DELETE SET NULL,
  project_name text,
  entity_type  text        NOT NULL,
  entity_id    text,
  action       text        NOT NULL,
  changed_by   text,
  old_values   jsonb,
  new_values   jsonb,
  note         text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON audit_log;
CREATE POLICY "allow_all" ON audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_project_id  ON audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_log(created_at DESC);


-- ----------------------------------------------------------------
-- SEKSI C: DB Trigger — auto-sync project_name saat nama diubah
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_project_name_on_rename()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE project_indicators  SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE indicator_updates   SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE indicator_evidence  SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE project_activities  SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE activity_notes      SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE activity_files      SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE budget_updates      SET project_name = NEW.name WHERE project_name = OLD.name;
    UPDATE project_outcomes    SET project_name = NEW.name WHERE project_name = OLD.name;

    INSERT INTO audit_log(project_id, project_name, entity_type, action, changed_by, old_values, new_values)
    VALUES (
      NEW.id, NEW.name, 'project', 'rename', 'system',
      jsonb_build_object('name', OLD.name),
      jsonb_build_object('name', NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_sync_name ON projects;
CREATE TRIGGER projects_sync_name
  AFTER UPDATE OF name ON projects
  FOR EACH ROW EXECUTE FUNCTION sync_project_name_on_rename();

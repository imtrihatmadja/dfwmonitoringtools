-- ============================================================
-- SCHEMA: Knowledge Management - Issues Module
-- PMIS DFW Indonesia - VERSI FIXED (tanpa dependensi tabel profiles)
-- Run once in Supabase SQL Editor
-- Compatible with: schema_beneficiary.sql, schema_beneficiary_projects.sql
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. ENUM TYPES
-- ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE issue_category AS ENUM (
    'IUU Fishing',
    'HAM Pekerja',
    'Lingkungan',
    'Perdagangan Manusia',
    'Perburuhan',
    'Kebijakan Kelautan',
    'Ketenagakerjaan',
    'Lainnya'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE issue_severity AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE issue_status AS ENUM (
    'pending_review',
    'active',
    'under_investigation',
    'resolved',
    'closed',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────
-- 2. TABLE: rss_sources (feed registry)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rss_sources (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  url          text NOT NULL UNIQUE,
  category     issue_category DEFAULT 'Lainnya',
  is_active    boolean DEFAULT true,
  last_fetched timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE rss_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rss_sources_select_all" ON rss_sources;
DROP POLICY IF EXISTS "rss_sources_admin_write" ON rss_sources;
DROP POLICY IF EXISTS "rss_sources_all_access" ON rss_sources;
-- Open access (Tim mode) - perketat setelah tabel profiles dibuat
CREATE POLICY "rss_sources_all_access" ON rss_sources
  FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 3. TABLE: issues (master)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text NOT NULL,
  description    text,
  category       issue_category NOT NULL DEFAULT 'Lainnya',
  severity       issue_severity NOT NULL DEFAULT 'medium',
  status         issue_status NOT NULL DEFAULT 'pending_review',

  -- Location (nullable FK to locations table if it exists)
  location_id    uuid,           -- FK added conditionally below
  province       text,           -- denormalized for fast filter
  location_name  text,           -- free-text fallback

  date_occurred  date,
  date_reported  date DEFAULT CURRENT_DATE,

  -- Source info
  source_type    text CHECK (source_type IN ('rss', 'manual', 'report', 'field_staff', 'partner')),
  source_link    text,
  source_hash    text UNIQUE,    -- SHA-256 of source_link to prevent RSS duplicates

  -- Tagging
  tags           text[] DEFAULT '{}',

  -- Audit
  created_by     text DEFAULT 'Tim',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Conditional FK: only add if locations table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'locations') THEN
    BEGIN
      ALTER TABLE issues
        ADD CONSTRAINT issues_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Open access (Tim mode) - tidak butuh tabel profiles
-- Ganti policy ini setelah tabel profiles dan auth diimplementasikan
DROP POLICY IF EXISTS "issues_field_staff_select" ON issues;
DROP POLICY IF EXISTS "issues_admin_write" ON issues;
DROP POLICY IF EXISTS "issues_update_own" ON issues;
DROP POLICY IF EXISTS "issues_delete_admin" ON issues;
DROP POLICY IF EXISTS "issues_all_access" ON issues;

CREATE POLICY "issues_all_access" ON issues
  FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 4. TABLE: issue_updates (timeline entries)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_updates (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id       uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  update_text    text NOT NULL,
  evidence_urls  text[] DEFAULT '{}',
  updated_by     text DEFAULT 'Tim',
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE issue_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_updates_all" ON issue_updates;
CREATE POLICY "issue_updates_all" ON issue_updates
  FOR ALL USING (true) WITH CHECK (true); -- mirrors Tim mode; tighten after auth

-- ──────────────────────────────────────────────
-- 5. TABLE: issue_relations (cross-links)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_relations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_id     uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  -- related_type: 'issue' | 'project' | 'beneficiary' | 'activity'
  related_type text NOT NULL CHECK (related_type IN ('issue','project','beneficiary','activity')),
  related_id   uuid NOT NULL,
  note         text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(issue_id, related_type, related_id)
);

ALTER TABLE issue_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_relations_all" ON issue_relations;
CREATE POLICY "issue_relations_all" ON issue_relations
  FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────
-- 6. TRIGGER: auto-update issues.updated_at
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_issues_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issues_updated_at ON issues;
CREATE TRIGGER trg_issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION set_issues_updated_at();

-- ──────────────────────────────────────────────
-- 7. INDEXES (optimized for 10k+ rows)
-- ──────────────────────────────────────────────
-- Issues table
CREATE INDEX IF NOT EXISTS idx_issues_status       ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_category     ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_severity     ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_province     ON issues(province);
CREATE INDEX IF NOT EXISTS idx_issues_date_occurred ON issues(date_occurred DESC);
CREATE INDEX IF NOT EXISTS idx_issues_created_at   ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_source_hash  ON issues(source_hash) WHERE source_hash IS NOT NULL;
-- GIN index for array tag search
CREATE INDEX IF NOT EXISTS idx_issues_tags         ON issues USING GIN(tags);

-- issue_updates
CREATE INDEX IF NOT EXISTS idx_issue_updates_issue_id  ON issue_updates(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_updates_updated_at ON issue_updates(updated_at DESC);

-- issue_relations
CREATE INDEX IF NOT EXISTS idx_issue_relations_issue_id     ON issue_relations(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_relations_related_id   ON issue_relations(related_id);
CREATE INDEX IF NOT EXISTS idx_issue_relations_related_type ON issue_relations(related_type);

-- ──────────────────────────────────────────────
-- 8. SEED DATA (dummy test records)
-- ──────────────────────────────────────────────
INSERT INTO rss_sources (name, url, category) VALUES
  ('KIARA News', 'https://kiara.or.id/feed/', 'IUU Fishing'),
  ('Destructive Fishing Watch', 'https://dfw.or.id/feed/', 'IUU Fishing'),
  ('Mongabay Indonesia', 'https://www.mongabay.co.id/feed/', 'Lingkungan'),
  ('Human Rights Watch Indonesia', 'https://www.hrw.org/asia/indonesia/feed', 'HAM Pekerja')
ON CONFLICT (url) DO NOTHING;

INSERT INTO issues (title, description, category, severity, status, province, location_name, date_occurred, date_reported, source_type, tags, created_by) VALUES
  (
    'Kapal Berbendera Asing Tertangkap Fishing Ilegal di Arafura',
    'Sebuah kapal berbendera Vietnam tertangkap melakukan penangkapan ikan secara ilegal di perairan Arafura, Maluku. Kapal membawa 12 ABK yang diduga korban perdagangan manusia.',
    'IUU Fishing', 'critical', 'active',
    'Maluku', 'Kepulauan Aru, Maluku',
    '2024-03-15', '2024-03-17',
    'field_staff',
    ARRAY['IUU Fishing', 'ABK Migran', 'Arafura', 'Vietnam'],
    'Tim'
  ),
  (
    'Pekerja Migran Kapal Ikan Tidak Dibayar 8 Bulan',
    'Laporan dari 7 nelayan asal NTT yang bekerja di kapal penangkap ikan PT. Samudera Sejati. Gaji tidak dibayar selama 8 bulan, dokumen disita, dan kebebasan bergerak dibatasi.',
    'HAM Pekerja', 'critical', 'under_investigation',
    'Jawa Timur', 'Pelabuhan Brondong, Lamongan',
    '2024-01-20', '2024-02-05',
    'report',
    ARRAY['Gaji Tidak Dibayar', 'Perampasan Dokumen', 'ABK Migran', 'NTT'],
    'Tim'
  ),
  (
    'Kerusakan Ekosistem Mangrove Akibat Tambak Udang Ilegal',
    'Pembukaan lahan tambak udang secara ilegal seluas 47 hektar merusak kawasan mangrove di pesisir Sulawesi Selatan. Aktivitas ini melibatkan backing pejabat lokal.',
    'Lingkungan', 'high', 'active',
    'Sulawesi Selatan', 'Pesisir Barru, Sulawesi Selatan',
    '2023-11-10', '2023-12-01',
    'rss',
    ARRAY['Mangrove', 'Tambak Ilegal', 'Sulawesi', 'Deforestasi'],
    'Tim'
  ),
  (
    'ABK Indonesia di Kapal Taiwan Alami Kekerasan Fisik',
    'Tiga ABK asal Sulawesi Utara melaporkan kekerasan fisik dari nakhoda kapal berbendera Taiwan di perairan Pasifik. Mereka berhasil kabur saat kapal bersandar di Pelabuhan Busan, Korea.',
    'HAM Pekerja', 'critical', 'pending_review',
    'Sulawesi Utara', 'Manado, Sulawesi Utara',
    '2024-08-01', '2024-09-10',
    'manual',
    ARRAY['Kekerasan Fisik', 'ABK', 'Taiwan', 'Korea', 'Pasifik'],
    'Tim'
  ),
  (
    'Penangkapan Hiu Paus di Perairan Raja Ampat',
    'Nelayan lokal melaporkan penangkapan hiu paus secara ilegal oleh kapal nelayan dari luar wilayah di kawasan konservasi Raja Ampat. Video viral di media sosial.',
    'IUU Fishing', 'high', 'resolved',
    'Papua Barat Daya', 'Raja Ampat, Papua Barat Daya',
    '2024-06-05', '2024-06-07',
    'manual',
    ARRAY['Hiu Paus', 'Raja Ampat', 'Kawasan Konservasi', 'Viral'],
    'Tim'
  )
ON CONFLICT DO NOTHING;

-- Insert some issue_updates for the first issue
DO $$
DECLARE v_issue_id uuid;
BEGIN
  SELECT id INTO v_issue_id FROM issues WHERE title LIKE 'Kapal Berbendera Asing%' LIMIT 1;
  IF v_issue_id IS NOT NULL THEN
    INSERT INTO issue_updates (issue_id, update_text, updated_by) VALUES
      (v_issue_id, 'KKP bersama Bakamla melakukan penyelidikan awal. Kapal diamankan di Pelabuhan Ambon.', 'Tim'),
      (v_issue_id, 'Hasil pemeriksaan awal: 12 ABK merupakan WNI dari NTT dan Sulawesi. 3 di antaranya mengalami trauma psikologis.', 'Tim'),
      (v_issue_id, 'Koordinasi dengan IOM Indonesia untuk pendampingan korban. Proses hukum terhadap nakhoda dimulai.', 'Tim')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ──────────────────────────────────────────────
-- 9. DASHBOARD VIEW (optional - for faster queries)
-- ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_issues_dashboard AS
SELECT
  i.id,
  i.title,
  i.category::text,
  i.severity::text,
  i.status::text,
  i.province,
  i.location_name,
  i.date_occurred,
  i.date_reported,
  i.source_type,
  i.tags,
  i.created_by,
  i.created_at,
  i.updated_at,
  COUNT(iu.id)::int                    AS update_count,
  MAX(iu.updated_at)                   AS last_update_at,
  -- Days since last update
  EXTRACT(DAY FROM now() - COALESCE(MAX(iu.updated_at), i.created_at))::int AS days_since_update
FROM issues i
LEFT JOIN issue_updates iu ON iu.issue_id = i.id
GROUP BY i.id;

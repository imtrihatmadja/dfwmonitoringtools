-- ===================== SCHEMA PMIS v4 (+ Budget) =====================

-- Tabel Proyek
CREATE TABLE IF NOT EXISTS projects (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text UNIQUE NOT NULL,
  location         text NOT NULL,
  owner            text NOT NULL,
  donor            text,
  start_date       date,
  deadline         date,
  status           text NOT NULL DEFAULT 'Aktif',
  progress         integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  description      text,
  note             text,
  budget_approved  numeric DEFAULT 0,
  budget_actual    numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Jika tabel sudah ada, tambahkan kolom budget (aman dijalankan ulang)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_approved numeric DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_actual   numeric DEFAULT 0;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabel Histori Realisasi Anggaran
CREATE TABLE IF NOT EXISTS budget_updates (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  actual_value numeric NOT NULL DEFAULT 0,
  note         text,
  updated_by   text,
  created_at   timestamptz DEFAULT now()
);

-- Tabel Indikator
CREATE TABLE IF NOT EXISTS project_indicators (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name   text NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  indicator_name text NOT NULL,
  type           text NOT NULL DEFAULT 'Output',
  target         numeric NOT NULL DEFAULT 0,
  unit           text,
  actual         numeric NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS indicators_updated_at ON project_indicators;
CREATE TRIGGER indicators_updated_at BEFORE UPDATE ON project_indicators
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabel Histori Update Indikator
CREATE TABLE IF NOT EXISTS indicator_updates (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_id   uuid REFERENCES project_indicators(id) ON DELETE CASCADE,
  project_name   text,
  indicator_name text,
  actual_value   numeric NOT NULL DEFAULT 0,
  note           text,
  updated_by     text,
  created_at     timestamptz DEFAULT now()
);

-- Tabel Bukti / Evidence Indikator
CREATE TABLE IF NOT EXISTS indicator_evidence (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_id uuid REFERENCES project_indicators(id) ON DELETE CASCADE,
  project_name text,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_size    bigint,
  file_type    text,
  uploaded_by  text,
  created_at   timestamptz DEFAULT now()
);

-- Tabel Aktivitas
CREATE TABLE IF NOT EXISTS project_activities (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  pic          text,
  status       text NOT NULL DEFAULT 'Belum Mulai',
  start_date   date,
  due_date     date,
  progress     integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS activities_updated_at ON project_activities;
CREATE TRIGGER activities_updated_at BEFORE UPDATE ON project_activities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabel Catatan Aktivitas
CREATE TABLE IF NOT EXISTS activity_notes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id  uuid REFERENCES project_activities(id) ON DELETE CASCADE,
  project_name text,
  note         text NOT NULL,
  noted_by     text,
  created_at   timestamptz DEFAULT now()
);

-- Tabel File Pendukung Aktivitas
CREATE TABLE IF NOT EXISTS activity_files (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id  uuid REFERENCES project_activities(id) ON DELETE CASCADE,
  project_name text,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_size    bigint,
  file_type    text,
  uploaded_by  text,
  created_at   timestamptz DEFAULT now()
);

-- ===================== RLS =====================
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_updates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_updates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_files     ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['projects','budget_updates','project_indicators','indicator_updates',
    'indicator_evidence','project_activities','activity_notes','activity_files'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "allow_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- ===================== STORAGE =====================
-- Buat bucket: activity-files | Public: ON

-- ===================== GOAL & OUTCOMES =====================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal text;

CREATE TABLE IF NOT EXISTS project_outcomes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  outcome_text text NOT NULL,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE project_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON project_outcomes;
CREATE POLICY "allow_all" ON project_outcomes FOR ALL USING (true) WITH CHECK (true);

-- ===================== AUTH & ROLES =====================
-- Jalankan di Supabase SQL Editor

-- 1. Tabel profil user
CREATE TABLE IF NOT EXISTS user_profiles (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  email          text,
  role           text NOT NULL DEFAULT 'viewer'
                 CHECK (role IN ('admin','manager','editor','viewer')),
  avatar_initial text DEFAULT '?',
  created_at     timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
-- Jika tabel sudah ada, jalankan ini di SQL Editor Supabase:
-- ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FIX BUG LOGIN: Hapus semua policy lama yang konflik
-- Policy "admin_all_profiles" menggunakan subquery RECURSIVE
-- ke tabel user_profiles sendiri → menyebabkan INSERT
-- profil pertama selalu gagal (infinite loop / blocked)
-- =====================================================
DROP POLICY IF EXISTS "users_own_profile"       ON user_profiles;
DROP POLICY IF EXISTS "admin_all_profiles"       ON user_profiles;
DROP POLICY IF EXISTS "read_all_profiles"        ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile"       ON user_profiles;
DROP POLICY IF EXISTS "allow_all"                ON user_profiles;
DROP POLICY IF EXISTS "allow_all_authenticated"  ON user_profiles;

-- SOLUSI: Gunakan policy allow_all untuk semua authenticated user
-- (konsisten dengan tabel lain di project ini)
-- Keamanan role (admin/manager/editor/viewer) dikelola di app.js
CREATE POLICY "allow_all_authenticated" ON user_profiles
  FOR ALL
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Kolom approved di tabel projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved     boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_by  text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_at  timestamptz;

-- 3. Cara membuat user pertama (Admin):
--    a. Buka Supabase Dashboard → Authentication → Users → Add User
--    b. Isi email & password
--    c. Jalankan query ini (ganti EMAIL dengan email yang didaftarkan):
--
-- INSERT INTO user_profiles (user_id, name, role, avatar_initial)
-- SELECT id, split_part(email,'@',1), 'admin', upper(left(email,1))
-- FROM auth.users WHERE email = 'EMAIL_ADMIN_ANDA@domain.com'
-- ON CONFLICT (user_id) DO UPDATE SET role='admin';

-- 4. Aktifkan Email Auth di:
--    Supabase Dashboard → Authentication → Providers → Email → Enable

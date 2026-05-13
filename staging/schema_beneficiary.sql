-- ================================================================
-- SCHEMA: Beneficiary Tracker (Penerima Manfaat)
-- PMIS DFW Indonesia
-- Jalankan di SQL Editor Supabase (satu kali)
-- ================================================================

-- Tabel master penerima manfaat
CREATE TABLE IF NOT EXISTS beneficiaries (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  phone        text,                          -- ID unik utama (no HP)
  gender       text,                          -- Laki-laki / Perempuan
  birth_year   integer,                       -- Tahun lahir (untuk hitung usia)
  location     text,                          -- Desa/Kecamatan/Kota
  occupation   text,                          -- Pekerjaan
  email        text,
  note         text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(name, phone)                         -- Kombinasi nama+HP = unik
);

ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON beneficiaries;
CREATE POLICY "allow_all" ON beneficiaries FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ben_name  ON beneficiaries(name);
CREATE INDEX IF NOT EXISTS idx_ben_phone ON beneficiaries(phone);

-- Tabel relasi: kegiatan ↔ penerima manfaat
CREATE TABLE IF NOT EXISTS activity_participants (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id     uuid        REFERENCES project_activities(id) ON DELETE CASCADE,
  activity_name   text,
  project_name    text,
  project_id      uuid        REFERENCES projects(id) ON DELETE CASCADE,
  beneficiary_id  uuid        REFERENCES beneficiaries(id) ON DELETE CASCADE,
  attended_date   date,
  note            text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(activity_id, beneficiary_id)         -- Satu orang max 1x per kegiatan
);

ALTER TABLE activity_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON activity_participants;
CREATE POLICY "allow_all" ON activity_participants FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ap_activity_id    ON activity_participants(activity_id);
CREATE INDEX IF NOT EXISTS idx_ap_beneficiary_id ON activity_participants(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_ap_project_id     ON activity_participants(project_id);
CREATE INDEX IF NOT EXISTS idx_ap_project_name   ON activity_participants(project_name);

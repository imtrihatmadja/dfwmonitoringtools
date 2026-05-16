-- ================================================================
-- SCHEMA: Knowledge Base Management (PMIS DFW Indonesia)
-- Jalankan di Supabase SQL Editor — satu kali saja
-- ================================================================

-- Tabel 1: Topik pantauan (dibuat oleh staf DFW)
CREATE TABLE IF NOT EXISTS kb_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  keywords    text[],            -- kata kunci untuk filter RSS
  description text,
  color       text DEFAULT '#2563eb',
  created_by  text,
  created_at  timestamptz DEFAULT now()
);

-- Tabel 2: Feed RSS yang dipantau per topik
CREATE TABLE IF NOT EXISTS kb_rss_feeds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid REFERENCES kb_topics(id) ON DELETE CASCADE,
  topic_name  text,
  feed_url    text NOT NULL,
  feed_name   text NOT NULL,
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Tabel 3: Artikel yang disimpan/ditandai staf dari hasil RSS
CREATE TABLE IF NOT EXISTS kb_articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id     uuid REFERENCES kb_topics(id) ON DELETE SET NULL,
  topic_name   text,
  title        text NOT NULL,
  source_url   text,
  source_name  text,
  summary      text,
  published_at text,
  status       text DEFAULT 'saved',   -- saved | reviewed | archived
  tags         text[],
  saved_by     text,
  note         text,
  created_at   timestamptz DEFAULT now()
);

-- Tabel 4: Repositori dokumen internal
CREATE TABLE IF NOT EXISTS kb_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  doc_type     text,    -- policy | report | regulation | module | template | other
  topic_id     uuid REFERENCES kb_topics(id) ON DELETE SET NULL,
  topic_name   text,
  project_name text,    -- opsional: kaitkan ke proyek
  file_url     text,    -- link Google Drive / Supabase Storage
  description  text,
  language     text DEFAULT 'id',
  tags         text[],
  uploaded_by  text,
  created_at   timestamptz DEFAULT now()
);

-- Enable RLS (tanpa policy ketat agar mudah di awal)
ALTER TABLE kb_topics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_documents ENABLE ROW LEVEL SECURITY;

-- Policy: akses penuh untuk semua authenticated user
CREATE POLICY "kb_full_access" ON kb_topics    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kb_full_access" ON kb_rss_feeds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kb_full_access" ON kb_articles  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kb_full_access" ON kb_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

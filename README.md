# PMIS DFW Indonesia

## Cara Deploy ke GitHub Pages

1. Buka https://github.com → New Repository (Public)
2. Upload keempat file: index.html, app.js, style.css, schema.sql
3. Settings → Pages → Source: Deploy from branch → main / root → Save
4. Tunggu 1-2 menit → akses di https://username.github.io/nama-repo/

## PENTING: Jangan buka index.html langsung dari folder!
File ini TIDAK akan berfungsi jika dibuka dengan double-click (file://).
Harus diakses melalui web server (GitHub Pages, Netlify, Live Server, dll).

## Update Supabase (jalankan di SQL Editor)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_approved numeric DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_actual   numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS budget_updates (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
  actual_value numeric NOT NULL DEFAULT 0,
  note         text,
  updated_by   text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE budget_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON budget_updates;
CREATE POLICY "allow_all" ON budget_updates FOR ALL USING (true) WITH CHECK (true);

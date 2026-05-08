# PMIS DFW Indonesia

## File Structure
```
index.html        ← Struktur halaman (diperbarui: mobile + print)
app.js            ← Logika utama (TIDAK diubah)
style.css         ← Styling (diperbarui: mobile responsive + print styles)
print-report.js   ← BARU: fungsi mobile sidebar + cetak laporan
schema.sql        ← Skema database Supabase (TIDAK diubah)
```

## Cara Deploy ke GitHub Pages

1. Buka https://github.com → New Repository (Public)
2. Upload **5 file**: `index.html`, `app.js`, `style.css`, `print-report.js`, `schema.sql`
3. Settings → Pages → Source: Deploy from branch → main / root → Save
4. Tunggu 1-2 menit → akses di `https://username.github.io/nama-repo/`

## PENTING: Jangan buka index.html langsung dari folder!
File ini TIDAK akan berfungsi jika dibuka dengan double-click (file://).
Harus diakses melalui web server (GitHub Pages, Netlify, Live Server, dll).

## Fitur Baru

### Mobile Responsive
- Sidebar berubah jadi drawer (geser dari kiri) di mobile
- Hamburger button (☰) di topbar untuk membuka sidebar
- Stat grid 2 kolom di mobile
- Tabel dengan scroll horizontal
- Panel detail stack vertikal di mobile
- Modal muncul dari bawah layar (bottom sheet)

### Fitur Cetak Laporan (Print Report)
- Tombol 🖨️ Cetak Laporan muncul saat membuka detail proyek
- Pilih bahasa: 🇮🇩 Bahasa Indonesia atau 🇬🇧 English
- Laporan terdiri dari 3 halaman A4:
  - **Hal. 1**: Cover, ringkasan eksekutif, progres keseluruhan
  - **Hal. 2**: Tabel capaian indikator + aktivitas (berjalan & belum mulai)
  - **Hal. 3**: Realisasi anggaran, narasi & lessons learned, tanda tangan
- Print via browser (Ctrl+P) → bisa simpan sebagai PDF

## Update Supabase (jalankan di SQL Editor jika belum)
```sql
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
```

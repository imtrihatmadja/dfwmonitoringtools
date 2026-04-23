# PMIS — Project Monitoring Information System

## Fitur Utama

- **Dashboard**: Ringkasan stat proyek + kartu proyek yang bisa diklik
- **Klik nama proyek** → buka halaman detail dengan:
  - **Dashboard singkat** (progress bar, 4 stat card: total indikator, tercapai, avg. capaian, update terakhir)
  - **Split view**: Panel kiri = List Aktivitas, Panel kanan = Update Capaian Indikator
- **List Aktivitas** (panel kiri):
  - Klik ✓ untuk tandai selesai/belum
  - Klik card untuk expand catatan inline
  - Tombol ✏️ buka modal edit lengkap + upload file multiple
  - File pendukung: drag & drop, staging list, upload semua sekaligus
- **Update Indikator** (panel kanan):
  - Isi capaian aktual per indikator
  - Histori 3 update terakhir langsung terlihat
  - Tombol "Simpan Update Capaian" menyimpan semua sekaligus
- **Tambah / Edit Proyek**: Wizard 3 langkah

## Setup

1. **Buat project Supabase** di https://supabase.com
2. Jalankan isi `schema.sql` di SQL Editor Supabase
3. Buat Storage bucket: nama `activity-files`, Public ON
4. Buka `app.js` dan isi:
   ```js
   const SUPABASE_URL      = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJh...";
   ```
5. Upload semua file ke Netlify / hosting statis
6. Buka `index.html` di browser

## Struktur File

```
index.html    ← UI utama
style.css     ← Semua styling
app.js        ← Logika, Supabase queries, realtime
schema.sql    ← Database schema
README.md     ← Dokumentasi ini
```

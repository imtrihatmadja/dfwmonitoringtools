# PMIS DFW Indonesia — Update: Goal & Outcomes

## Cara Deploy Update Ini

### Langkah 1: Update Database Supabase
1. Buka Supabase → SQL Editor
2. Jalankan bagian bawah `schema.sql` (bagian "GOAL & OUTCOMES"):
   ```sql
   ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal text;
   CREATE TABLE IF NOT EXISTS project_outcomes ( ... );
   ```

### Langkah 2: Replace File di GitHub/Hosting
Upload dan replace file berikut:
- `index.html`
- `app.js`
- `style.css` (tidak berubah, disertakan untuk kelengkapan)

### Fitur Baru
- **Form Tambah/Edit Proyek**: Field Goal (1 textarea) + Outcomes (dinamis, + Tambah Outcome)
- **Mini Dashboard Card**: Tampil Goal & daftar Outcomes di setiap project card
- **Halaman Detail Proyek**: Tampil Goal (kotak biru) & Outcomes (kotak ungu) di header

### Catatan
- `schema.sql` hanya perlu dijalankan sekali di Supabase
- Proyek lama yang belum punya Goal/Outcomes tetap berjalan normal

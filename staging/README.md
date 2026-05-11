# ProMonitor PMIS — DFW Indonesia  
## Versi 5 / Tahap 1 — Siap Deploy

---

## ⚠️  WAJIB: Jalankan SQL dulu sebelum upload file

1. Buka https://supabase.com → project Anda → **SQL Editor**  
2. Copy-paste isi file `schema_v5_tahap1.sql` → klik **Run**  
3. Tunggu sampai tidak ada error, baru lanjut ke deploy file.

---

## Deploy ke GitHub Pages

1. Buka repo `dfwmonitoringtools` di GitHub  
2. Upload / replace semua file berikut:
   - `index.html`
   - `app.js`
   - `style.css`
   - `documents.js`
   - `impact.js`
   - `print-report.js`
   - `schema_v5_tahap1.sql` *(referensi, tidak dieksekusi browser)*
3. Tulis pesan commit, klik **Commit changes**  
4. Tunggu 1–2 menit → buka URL GitHub Pages Anda

---

## Fitur baru di v5 (Tahap 1)

| # | Fitur | Detail |
|---|---|---|
| 1 | **project_id di semua tabel** | Relasi UUID menggantikan project_name sebagai kunci utama |
| 2 | **Soft delete / Arsip** | Hapus = arsip, data tetap aman. Tab baru "Arsip Proyek" di sidebar |
| 3 | **Pulihkan proyek** | Proyek yang diarsipkan bisa dikembalikan dengan tombol Pulihkan |
| 4 | **Audit log** | Setiap simpan/edit/arsip/pulihkan tercatat di tabel audit_log |
| 5 | **DB trigger rename** | Ubah nama proyek → semua tabel turunan ikut update otomatis via trigger |
| 6 | **Save lebih aman** | Upsert menangkap UUID dari Supabase dan meneruskan ke semua insert turunan |

---

## Catatan pengembangan selanjutnya

- `AUDIT_USER = "Tim"` di `app.js` → ganti dengan nama login user setelah fitur auth ditambahkan
- Tahap 2 berikutnya: Login Gmail + Role access (Admin / Program Manager / Staff)

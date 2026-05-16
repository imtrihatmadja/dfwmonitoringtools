# ProMonitor PMIS — DFW Indonesia
## Paket Final + Knowledge Base RSS Stabil

---

## WAJIB: Jalankan SQL terlebih dahulu

Sebelum upload file ke GitHub, jalankan dua schema berikut di Supabase SQL Editor:

1. `schema_v5_tahap1.sql`
2. `schema_knowledge_base.sql`

Urutan:
1. Buka project Supabase Anda.
2. Masuk ke **SQL Editor**.
3. Jalankan `schema_v5_tahap1.sql`.
4. Setelah sukses, jalankan `schema_knowledge_base.sql`.
5. Pastikan tidak ada error.

---

## File yang harus di-upload / replace

Upload dan replace file berikut di repo GitHub:

- `index.html`
- `app.js`
- `style.css`
- `documents.js`
- `impact.js`
- `print-report.js`
- `import.js`
- `knowledge.js`
- `schema_v5_tahap1.sql`
- `schema_knowledge_base.sql`

Catatan:
- File `.sql` tidak dijalankan oleh browser, tetapi tetap disimpan di repo sebagai referensi deploy.
- `knowledge.js` wajib ikut di-upload karena ini inti fitur RSS Knowledge Base.

---

## Langkah deploy

1. Buka repo GitHub proyek Anda.
2. Upload / replace semua file di atas.
3. Tulis commit message, misalnya: `fix knowledge base rss stable package`
4. Klik **Commit changes**
5. Tunggu 1–2 menit
6. Buka GitHub Pages
7. Lakukan hard refresh dengan `Ctrl + F5`

---

## Sumber RSS default yang aman

Paket ini memakai beberapa sumber default yang relatif aman dipakai:

- Google News RSS: Perikanan Indonesia
- Google News RSS: IUU Fishing Indonesia
- Google News RSS: Hak Buruh Nelayan
- Google News RSS: Trafficking Nelayan
- Google News RSS: Forced Labour Fishing
- Antara RSS Perikanan
- Tempo RSS Lingkungan

Catatan penting:
- Jangan masukkan halaman biasa seperti `/tag/...` atau halaman HTML umum.
- Gunakan feed yang benar, biasanya mengandung `/rss`, `/feed`, atau `.xml`.

---

## Jika masih muncul HTTP 422

Biasanya penyebabnya salah satu dari ini:

1. URL yang dimasukkan bukan RSS feed valid.
2. Layanan parser publik `rss2json` sedang limit / sibuk.
3. Feed sumber menolak parser pihak ketiga.
4. Browser masih cache file JS lama.

Coba langkah berikut:
- Ganti ke feed default dulu.
- Hard refresh browser.
- Coba lagi 1–2 menit kemudian.
- Pastikan schema `schema_knowledge_base.sql` terbaru sudah dijalankan.

---

## Catatan teknis

- Aplikasi saat ini memakai Supabase anon client dari `app.js`.
- Karena itu policy RLS pada Knowledge Base harus membuka akses untuk `anon` dan `authenticated`.
- Field database untuk Knowledge Base menggunakan format snake_case, misalnya:
  - `feed_name`
  - `feed_url`
  - `source_name`
  - `source_url`
  - `published_at`

---

## Rencana tahap berikutnya

Penguatan tahap berikutnya yang disarankan:

- Edge Function / proxy RSS milik sendiri agar tidak tergantung `rss2json`
- Login user Supabase/Auth
- Role access admin / staff
- Tagging artikel per topik dan proyek
- Sinkronisasi artikel ke dokumen / evidence project

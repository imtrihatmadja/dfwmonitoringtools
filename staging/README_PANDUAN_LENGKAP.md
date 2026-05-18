# 📦 Modul Isu - PMIS DFW Indonesia
## Panduan Lengkap untuk Non-Developer

---

## 📁 ISI FOLDER INI

| File | Fungsi |
|------|--------|
| `schema_issues.sql` | Struktur database baru (jalankan di Supabase) |
| `issues.js` | Logika halaman Isu (upload ke GitHub) |
| `issues_html_snippet.html` | Tampilan HTML (copy-paste ke index.html) |
| `issues_dashboard_queries.sql` | Query SQL untuk laporan dashboard |
| `supabase/functions/rss-scraper/index.ts` | Robot RSS otomatis (opsional, bisa skip dulu) |

---

## 🗺️ URUTAN PENGERJAAN

```
LANGKAH 1 → Supabase (buat tabel database baru)
LANGKAH 2 → Edit index.html (tambah tab & HTML)
LANGKAH 3 → Upload issues.js ke GitHub
LANGKAH 4 → Edit app.js (daftarkan modul baru)
LANGKAH 5 → Test di browser
LANGKAH 6 → (Opsional) Setup RSS otomatis
```

---

## ✅ LANGKAH 1 — Buat Tabel Database di Supabase

**Perkiraan waktu: 5 menit**

1. Buka browser, pergi ke **https://supabase.com**
2. Login → pilih project PMIS Anda
3. Klik menu **"SQL Editor"** di sidebar kiri (ikon database)
4. Klik tombol **"New query"** (tombol + di atas)
5. Buka file `schema_issues.sql` dengan Notepad atau text editor apapun
6. Tekan **Ctrl+A** (pilih semua) → **Ctrl+C** (copy)
7. Klik di area kotak putih SQL Editor → **Ctrl+V** (paste)
8. Klik tombol **"Run"** (tombol hijau, atau tekan Ctrl+Enter)
9. Tunggu sampai muncul tulisan **"Success"** di bawah
10. Verifikasi: Klik **"Table Editor"** di sidebar → pastikan ada tabel baru:
    - `issues`
    - `issue_updates`
    - `issue_relations`
    - `rss_sources`

> ⚠️ Jika muncul error merah, screenshot dan kirim ke saya untuk dibantu.

---

## ✅ LANGKAH 2A — Tambah Tab Navigasi di index.html

**Perkiraan waktu: 5 menit**

1. Buka **GitHub.com** → masuk ke repository PMIS Anda
2. Klik file **`index.html`**
3. Klik tombol **pensil (✏️ Edit)** di pojok kanan atas
4. Tekan **Ctrl+F** di browser → ketik: `tab-documents` atau `Dokumen`
5. Cari baris yang berisi tombol tab untuk "Dokumen" atau modul lain
   Contoh yang sudah ada:
   ```html
   <button ... onclick="showSection('beneficiary')">Penerima Manfaat</button>
   ```
6. Di BAWAH baris tab terakhir, tambahkan baris baru ini:
   ```html
   <button class="nav-tab" onclick="showSection('issues')" id="tab-issues">
     <i class="fa-solid fa-triangle-exclamation"></i>
     <span>Isu &amp; Kasus</span>
   </button>
   ```
7. **Jangan simpan dulu** — lanjut ke Langkah 2B

---

## ✅ LANGKAH 2B — Tambah Section HTML di index.html

**Perkiraan waktu: 5 menit**

Masih di halaman edit `index.html`:

1. Tekan **Ctrl+F** → ketik: `section-beneficiary`
2. Scroll ke bawah sampai menemukan baris: `</div>` penutup section beneficiary
   (biasanya ada komentar seperti `<!-- END section beneficiary -->`)
3. Klik tepat SETELAH baris penutup tersebut
4. Buka file **`issues_html_snippet.html`** dengan Notepad
5. **Ctrl+A** → **Ctrl+C** (copy semua isi file)
6. Kembali ke GitHub, klik posisi di bawah section beneficiary
7. Tekan **Ctrl+V** (paste)
8. Scroll ke bawah halaman GitHub, isi kotak **"Commit changes"**:
   - Judul: `Tambah HTML section Isu`
9. Klik **"Commit changes"** (tombol hijau)

---

## ✅ LANGKAH 3 — Upload issues.js ke GitHub

**Perkiraan waktu: 3 menit**

1. Di GitHub repository, klik tombol **"Add file"** → **"Upload files"**
2. Drag & drop file **`issues.js`** dari folder download Anda ke area upload
3. Isi commit message: `Tambah modul issues.js`
4. Klik **"Commit changes"**

---

## ✅ LANGKAH 4 — Daftarkan Script di index.html

**Perkiraan waktu: 3 menit**

1. Buka `index.html` untuk diedit lagi (klik pensil ✏️)
2. Tekan **Ctrl+F** → ketik: `beneficiary.js`
3. Temukan baris: `<script src="beneficiary.js"></script>`
4. Di BAWAH baris itu, tambahkan:
   ```html
   <script src="issues.js"></script>
   ```
5. Commit dengan pesan: `Daftarkan issues.js`

---

## ✅ LANGKAH 5 — Daftarkan di app.js (showSection)

**Perkiraan waktu: 5 menit**

1. Buka **`app.js`** untuk diedit
2. Tekan **Ctrl+F** → ketik: `showSection`
3. Cari bagian kode yang berisi kondisi untuk tiap section, contoh:
   ```javascript
   if (name === 'beneficiary') loadBeneficiaries();
   if (name === 'documents') loadDocuments();
   ```
4. Tambahkan satu baris baru di bawahnya:
   ```javascript
   if (name === 'issues') loadIssues();
   ```
5. Commit dengan pesan: `Daftarkan loadIssues di showSection`

---

## ✅ LANGKAH 6 — Test di Browser

1. Buka website PMIS Anda di browser
2. Tekan **Ctrl+Shift+R** (hard refresh)
3. Cari tab baru **"Isu & Kasus"** di navigasi
4. Klik tab tersebut
5. Harus muncul 5 data isu contoh yang sudah diisi otomatis
6. Coba klik tombol **"Tambah Isu"** → isi form → simpan → data baru muncul ✅

> Jika ada error merah atau halaman blank: tekan F12 → klik tab "Console" → screenshot pesan merah → kirim ke saya.

---

## ✅ LANGKAH 7 (OPSIONAL) — Setup RSS Scraper Otomatis

**Skip dulu jika belum familiar. Bisa dikerjakan belakangan.**

Fitur ini membuat sistem otomatis mengambil berita dari RSS feed seperti
Mongabay, KIARA, DFW setiap 6 jam dan memasukkannya sebagai isu baru
dengan status "Menunggu Review". Staff kemudian bisa approve atau tolak.

Butuh: Supabase CLI (program di komputer). Jika butuh bantuan setup ini,
beritahu saya dan saya akan buatkan panduan khusus langkah per langkah.

---

## ❓ TROUBLESHOOTING UMUM

| Masalah | Solusi |
|---------|--------|
| Tab "Isu & Kasus" tidak muncul | Pastikan Langkah 2A sudah benar, cek spasi/kutip |
| Klik tab tidak ada isinya | Pastikan `issues.js` sudah diupload (Langkah 3) |
| Tabel kosong / error merah | Pastikan `schema_issues.sql` sudah dijalankan di Supabase |
| "loadIssues is not defined" | Pastikan script tag issues.js sudah ditambah (Langkah 4) |
| Data tidak tersimpan | Cek koneksi Supabase, buka F12 → Console |

---

## 💬 Butuh Bantuan?

Kirim screenshot error ke saya (Perplexity), saya akan bantu diagnosa dan
berikan kode perbaikan yang siap pakai.


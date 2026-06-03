# PIMS — Detail Proyek Redesign v4

## Ringkasan Perubahan v4

| Fitur | Keterangan |
|-------|-----------|
| **Anggaran embedded** | Kartu Anggaran Proyek kini berada di dalam Kartu Progress Keseluruhan (dipisah garis tipis) agar tinggi kolom kanan seimbang dengan kolom kiri |
| **Scroll Aktivitas** | Kartu Aktivitas Pelaksanaan bisa di-scroll (max-height 360px) sehingga halaman tidak terlalu panjang |
| **Scroll Indikator** | Kartu Capaian Indikator juga scrollable (max-height 360px) |
| **Sub-Aktivitas** | Tombol "Sub" tetap tampil di setiap baris aktivitas; klik judul aktivitas untuk expand detail + sub-aktivitas (diambil langsung dari tabel `sub_activities`) |
| **Refleksi lengkap** | Kartu Refleksi & Pembelajaran menampilkan semua field: tanggal, tipe badge, judul, what_happened, lesson_learned, next_steps; re-render otomatis setiap `loadProjectReflections` dipanggil |
| **Kartu Dokumen** | Kartu Dokumen Proyek tampil di kolom kanan (bawah); hanya dokumen yang cocok dengan `project_id` atau `project_name` proyek aktif yang ditampilkan |

## Struktur File

| File | Keterangan |
|------|-----------|
| `index.html` | HTML utama — `#detail-content` wrapper + hidden panels untuk kompatibilitas JS |
| `style.css`  | CSS original + blok Redesign v4 di akhir |
| `app.js`     | JS original + render patch v4 (fungsi `renderProjectDetailPageV4`) di akhir |
| `app_sprint4.js` | Tidak diubah |

## Cara Deploy

1. Upload semua file ke GitHub / Netlify **menggantikan** versi lama
2. Hard refresh browser: **Ctrl + Shift + R**

## Catatan Teknis

- Kartu Dokumen query Supabase: `project_documents` by `project_id`, fallback ke `project_name`
- Sub-Aktivitas query Supabase: `sub_activities` by `activity_id`
- Refleksi: hook ke `renderProjectReflectionsPanel` yang sudah ada di app.js — otomatis sync
- Semua fungsi lama (edit proyek, update indikator, simpan refleksi, modal aktivitas) tetap berfungsi melalui hidden DOM elements

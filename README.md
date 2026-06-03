# PIMS — Detail Proyek Redesign v3

## File yang diperbarui

| File | Keterangan |
|------|-----------|
| `index.html` | HTML utama — tab-detail diperbarui dengan `#detail-content` wrapper |
| `style.css`  | CSS utama + tambahan blok `DETAIL PROYEK REDESIGN v3` di akhir |
| `app.js`     | JS utama + render patch `renderProjectDetailPageV3` di akhir |
| `app_sprint4.js` | Tidak diubah (Sprint 4 staff workload) |

## Cara deploy

1. Upload semua file ke repo GitHub / Netlify menggantikan versi lama.
2. Pastikan nama file sudah sesuai dengan referensi di `index.html`.
3. Hard refresh browser (Ctrl+Shift+R) untuk memuat versi baru.

## Perubahan desain

### Sticky Topbar
- Menampilkan breadcrumb "Detail Proyek" + nama proyek
- Tombol: Realtime ON badge, Refresh, Print Laporan (biru), Login Google, Logout, Kembali

### 2-Column Grid Layout
- **Kolom kiri (lebih lebar):** Informasi Proyek → Aktivitas Pelaksanaan → Refleksi
- **Kolom kanan:** Progress Keseluruhan → Anggaran Proyek → Capaian Indikator

### Kartu-kartu
- **Informasi Proyek:** Meta-grid (Lokasi, PIC, Pendana, Deadline) + blok Goal (biru) + blok Outcomes (ungu bernomor)
- **Progress Keseluruhan:** Angka % besar + status badge (Sangat Baik/Baik/Sedang/Perlu Perhatian) + progress bar tebal + 4 metrik kunci
- **Anggaran Proyek:** Progress bar oranye + nominal anggaran & realisasi + badge % terserap
- **Aktivitas Pelaksanaan:** Setiap baris ada progress bar individual + label status berwarna + tombol edit/lihat/hapus
- **Capaian Indikator:** Actual vs Target + badge % besar + progress bar per indikator

### Konsistensi visual
- `border-radius: 14px` pada semua kartu
- `box-shadow: 0 2px 8px rgba(15,23,42,.05)` — melayang tipis
- Padding konsisten `18px 20px`
- Typography Satoshi (sama dengan sebelumnya)

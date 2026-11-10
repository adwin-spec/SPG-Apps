# DEVELOPMENT_PROGRESS

_Pembaruan: 2026-11-10 · branch `main` · versi 2.0 (backend Python)_

## Ringkasan perubahan versi 2.0
Backend NestJS/TypeScript diganti **FastAPI (Python)** agar bisa diedit sendiri; konsep aplikasi disesuaikan dengan
form digital terbaru (Grosir, HORECA, Reguler), SPG multi-tugas, foto responden dengan persetujuan, dan supervisor
per kecamatan. Versi lama tersimpan di tag git **`v1-typescript`**.

| Bagian | Status | Bukti |
|---|---|---|
| Backend FastAPI: auth (rotasi refresh token), akun & tugas, wilayah supervisor dengan riwayat, master wilayah, pengaturan | ✅ | pytest |
| Form Grosir / HORECA / Reguler didefinisikan di Python, divalidasi server, ditampilkan HP dari API | ✅ | pytest + Playwright |
| Foto (unggah, perkecil, buang EXIF/GPS, akses dibatasi), persetujuan responden HORECA | ✅ | pytest + Playwright |
| Persetujuan per wilayah supervisor (ditegakkan server), tolak → perbaiki → kirim ulang | ✅ | pytest + Playwright |
| Dashboard 3 kategori dari laporan disetujui, filter wilayah/tipe/SPG/supervisor, drill-down, CSV | ✅ | pytest + Playwright |
| Riwayat & audit append-only (trigger database) | ✅ | pytest |
| Next.js: aplikasi HP + halaman manajemen | ✅ | typecheck, build, Playwright (4 skenario, tanpa error halaman, tanpa geser horizontal di HP) |
| Docker (api Python, web) & CI GitHub Actions | 🟡 ditulis | belum dijalankan di lingkungan ini (tidak ada Docker daemon); akan terverifikasi oleh CI setelah push |

## Tes terakhir (semua lulus)
* `apps/api` pytest – 8 skenario (auth & penyalahgunaan token, validasi form, isolasi antar-SPG, foto & persetujuan,
  routing supervisor & tolak/perbaiki, aturan kirim Grosir & CSV, append-only, data contoh 3 dashboard)
* `apps/web` Playwright – 4 skenario (SPG HORECA + foto → SPV setuju → dashboard; SPG Reguler; halaman admin & data contoh;
  SPG tidak bisa membuka halaman manajemen)
* Migrasi Alembic naik–turun–naik berhasil; seed 119 kab/kota, 2.146 kecamatan

## Fitur versi 1 yang TIDAK dibawa ke versi 2 (masih ada di tag `v1-typescript`)
1. Mesin KPI (bobot, target, ranking, kunci periode) – dashboard v2 berisi metrik operasional, bukan skor KPI.
2. OCR form kertas & integrasi Google Drive/Sheets – tidak relevan karena semua form kini digital.
3. Absensi, GPS/geofence, rencana kunjungan.
4. Master retailer & transaksi dengan maker-checker, notifikasi, 15 laporan PDF/Excel (v2: unduh CSV per kategori).
5. Antrean offline penuh (IndexedDB). v2: laporan terbuka disimpan di HP dan dikirim ulang otomatis; **foto dan
   tombol Kirim butuh sinyal**.

## Batasan yang perlu diketahui
* Batas percobaan login dihitung per proses API.
* Dashboard memuat hingga 20.000 laporan disetujui per permintaan (cukup ±90 hari untuk 100 SPG); di atas itu perlu agregasi harian.
* Belum ada deployment publik (butuh server & domain Anda, lihat `infrastructure/deployment/DEPLOYMENT.md`).

## Langkah berikutnya yang disarankan
1. Jalankan di server staging, uji dengan 2–3 SPG dan 1 supervisor sungguhan.
2. Konfirmasi isi form Reguler (usulan) dengan tim lapangan.
3. Tentukan SOP retensi foto responden (UU PDP No. 27/2022).
4. Bila diperlukan, bangun kembali skor KPI di atas data v2.

# Arsitektur

```
HP SPG / browser ──► Next.js (apps/web, port 3000) ──/api/v1/*──► FastAPI (apps/api, port 4000) ──► PostgreSQL
                         (proxy same-origin)                         │
                                                                     └─► STORAGE_DIR/photos (file foto)
```

## Prinsip

1. **Logika di Python, tampilan di Next.js.** Form dikirim ke HP sebagai data (`GET /forms`); dashboard dikirim
   sebagai daftar panel (`GET /dashboard`). Frontend tidak menyimpan aturan bisnis.
2. **Validasi di server.** Setiap simpan laporan dibersihkan ulang dengan definisi form yang sama: jawaban
   pertanyaan yang tidak tampil dibuang, kecamatan diganti dengan data resmi master, nama dirapikan, foto
   harus milik SPG yang mengirim.
3. **Hak akses di server** (`services/access.py`):
   * SPG hanya membaca/mengubah laporannya sendiri, hanya untuk tugas yang diberikan, satu laporan terbuka sekaligus.
   * Supervisor hanya bisa menyetujui/menolak laporan yang kecamatan lokasinya ada dalam wilayahnya.
   * Admin pusat: semua, termasuk pengaturan, akun, wilayah.
4. **Dashboard dari salinan disetujui** (`approvals.snapshot`), sehingga perubahan setelah persetujuan tidak
   mengubah angka.
5. **Riwayat tidak bisa dihapus.** `report_log` dan `audit_log` dijaga trigger database (append-only). Wilayah
   supervisor yang dilepas diberi tanggal `until`, tidak dihapus.
6. **Offline ringan.** Aplikasi HP menyimpan laporan terbuka di perangkat dan mengirim ulang saat sinyal kembali.
   Id laporan dibuat di HP (UUID) sehingga pengiriman ulang tidak menggandakan. Foto dan tombol "Kirim" butuh sinyal.
7. **Sesi**: access token 15 menit di memori; refresh token di cookie httpOnly, diputar setiap pemakaian, dan
   seluruh rangkaian dicabut bila token lama dipakai ulang.

## Alur laporan

`DRAFT` → (SPG kirim) `SUBMITTED` → (supervisor wilayah / admin) `APPROVED` → masuk dashboard
                                   ↘ `REJECTED` (alasan wajib) → (SPG perbaiki) `REVISION` → `SUBMITTED` (revisi +1)

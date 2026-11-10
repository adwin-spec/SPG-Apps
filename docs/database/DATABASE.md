# Database

PostgreSQL 16, dikelola dengan Alembic (`apps/api/alembic`). Definisi tabel: `apps/api/app/models.py`.

| Tabel | Isi |
|---|---|
| `users` | akun: `role` ADMIN/SPV/SPG, `tugas` (JSON, untuk SPG), status aktif, `token_version` (logout paksa) |
| `refresh_tokens` | sesi login (hash token, rangkaian/family, kedaluwarsa) |
| `spv_coverage` | wilayah supervisor: `level` KAB/KEC, `kode`, `since`, `until` (null = masih berlaku) |
| `kabupaten`, `kecamatan` | master wilayah; kecamatan bisa dinonaktifkan; tambahan manual ditandai `manual` |
| `settings` | `app` → merek, varian, daftar grosir |
| `reports` | laporan SPG; `data` JSON `{header, entries, sections, closing}`; `loc_kode` = kecamatan lokasi |
| `report_log` | riwayat laporan (append-only, trigger) |
| `approvals` | salinan laporan saat disetujui + penyetuju; `sample=true` untuk data contoh |
| `photos` | metadata foto; file di `STORAGE_DIR/photos` (sudah diperkecil, metadata EXIF/GPS dibuang) |
| `audit_log` | log perubahan oleh admin/supervisor (append-only, trigger) |

Isi form disimpan sebagai JSON sehingga perubahan pertanyaan di `forms.py` tidak membutuhkan migrasi.
Backup/restore: `infrastructure/scripts/backup-db.sh` dan `restore-db.sh` (foto di volume `photos` perlu dibackup terpisah).

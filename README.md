# Tanda Tambah – SPG Performance & Market Intelligence

Aplikasi lapangan dan dashboard untuk SPG rokok Tanda Tambah:

* **SPG Grosir** – laporan harian pembeli di grosir, promo dan promotor kompetitor, merek terlaris.
* **SPG Reguler** – kunjungan outlet: stok per varian, facing (share of shelf), POSM, order, kompetitor, foto rak.
* **Survei HORECA** – responden perokok dewasa di venue, sampel, kesan, pembelian, **foto SPG bersama responden** (dengan persetujuan).
* Satu SPG bisa memegang beberapa tugas (mis. SPG Grosir yang juga survei HORECA).
* **Supervisor per wilayah**: laporan diarahkan otomatis ke supervisor yang memegang kecamatan lokasinya
  (seluruh kab/kota atau per kecamatan); dibatasi di server. Wilayah tanpa supervisor ditangani admin pusat.
* Laporan ditolak → dikerjakan ulang oleh SPG yang sama → dikirim ulang (riwayat revisi tercatat).
* Dashboard hanya dari laporan yang **disetujui**; filter provinsi / kab/kota / kecamatan / tipe toko / SPG / supervisor; unduh CSV.
* Master wilayah: 119 kab/kota dan 2.146 kecamatan Jawa + DKI (Kepmendagri No. 300.2.2-2138 Tahun 2025), bisa diedit.

## Arsitektur singkat

| Bagian | Teknologi | Folder |
|---|---|---|
| Backend & logika bisnis | **Python 3.13, FastAPI, SQLAlchemy, Alembic** | `apps/api` |
| Database | PostgreSQL 16 | – |
| Tampilan web & aplikasi HP (PWA) | Next.js 15 (TypeScript) | `apps/web` |

Definisi form (`apps/api/app/forms.py`) dan isi dashboard (`apps/api/app/services/dashboard.py`) ditulis di
Python; frontend hanya menampilkannya. **Panduan mengedit sendiri: [docs/PANDUAN_PYTHON_ANTIGRAVITY.md](docs/PANDUAN_PYTHON_ANTIGRAVITY.md).**

## Menjalankan cepat (Docker)

```bash
cp .env.example .env
```

Isi semua `CHANGE_ME` di `.env`, lalu:

```bash
docker compose up -d --build
```

Buka http://localhost:3000 dan masuk dengan `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Untuk domain + HTTPS lihat
[infrastructure/deployment/DEPLOYMENT.md](infrastructure/deployment/DEPLOYMENT.md).

## Pengembangan lokal tanpa Docker

Lihat [panduan](docs/PANDUAN_PYTHON_ANTIGRAVITY.md) bagian 1–2. Ringkasnya: backend `uvicorn app.main:app --reload --port 4000`
di `apps/api`, frontend `pnpm dev:web` di root.

## Tes

* Backend: `cd apps/api && python -m pytest -q tests` (database `tanda_test`, dibuat otomatis)
* Web end-to-end: jalankan API + web, lalu `pnpm test:e2e:web`

## Dokumentasi

* [Panduan edit dengan Python / Antigravity](docs/PANDUAN_PYTHON_ANTIGRAVITY.md)
* [Panduan pengguna](docs/user-guide/USER_GUIDE.md)
* [Arsitektur](docs/architecture/ARCHITECTURE.md) · [Database](docs/database/DATABASE.md) · [API](docs/api/API.md)
* [Deployment](infrastructure/deployment/DEPLOYMENT.md) · [Status pengembangan](DEVELOPMENT_PROGRESS.md)

Versi sebelumnya (backend NestJS/TypeScript dengan modul KPI, OCR kertas, absensi GPS) disimpan di branch git
`v1-typescript`.

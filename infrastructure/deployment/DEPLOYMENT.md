# Deployment

Kebutuhan: server Linux (2 vCPU, 4 GB RAM cukup untuk ±100 SPG), Docker + Docker Compose, domain yang mengarah ke server.

1. Ambil kode: `git clone https://github.com/adwin-spec/SPG-Apps.git && cd SPG-Apps`
2. `cp .env.example .env` lalu isi semua `CHANGE_ME` (password database, `JWT_SECRET` ≥ 32 karakter acak,
   `ADMIN_PASSWORD`, `SITE_DOMAIN`).
3. Jalankan dengan HTTPS otomatis: `docker compose --profile https up -d --build`
4. Buka `https://<SITE_DOMAIN>` dan masuk sebagai admin. Segera ganti password admin bila perlu.

Layanan: `db` (PostgreSQL), `migrate` (Alembic + seed wilayah & admin, sekali jalan), `api` (FastAPI),
`web` (Next.js), `proxy` (Caddy).

**Pembaruan versi**: `git pull && docker compose --profile https up -d --build` (migrasi jalan otomatis).

**Backup harian** (cron): `DATABASE_URL=... BACKUP_DIR=/var/backups/tanda ./infrastructure/scripts/backup-db.sh`.
Backup juga volume foto: `docker run --rm -v tanda-tambah_photos:/d -v /var/backups/tanda:/b alpine tar czf /b/photos-$(date +%F).tgz -C /d .`

**Catatan**: batas login per menit dihitung per proses API (2 worker). Untuk beberapa server sekaligus, pasang
pembatas di Caddy atau firewall.

# API (FastAPI)

Dokumentasi interaktif: `http://<server>:4000/api/docs`. Spesifikasi lengkap: [openapi.json](openapi.json).
Semua respons berbentuk `{"data": ...}`; kesalahan `{"error": {"code", "message", "details"}}`.

| Endpoint | Peran | Keterangan |
|---|---|---|
| `POST /api/v1/auth/login`, `/refresh`, `/logout`, `GET /auth/me` | semua | sesi |
| `GET /forms` | semua | definisi form + merek/varian + nama & wilayah supervisor |
| `GET/PUT /settings` | baca semua · ubah ADMIN | merek, varian, grosir |
| `GET /wilayah` · `POST /wilayah/kabupaten`, `/wilayah/kecamatan` · `PATCH /wilayah/kecamatan/{kode}` | baca semua · ubah ADMIN | master wilayah |
| `GET/POST /users` · `PATCH /users/{id}` | ADMIN (SPV baca daftar SPG) | akun, tugas, aktif/nonaktif, reset password |
| `POST /users/{id}/coverage` · `DELETE /users/{id}/coverage/{cid}` | ADMIN | wilayah supervisor |
| `POST /photos` · `GET /photos/{id}` | semua (SPG hanya fotonya) | unggah/lihat foto |
| `GET /reports/mine` · `PUT /reports/{id}` · `POST /reports/{id}/submit` · `/rework` · `DELETE /reports/{id}` | SPG pemilik | laporan |
| `GET /review` · `GET /review/{id}` · `POST /review/{id}/approve` · `/reject` | ADMIN, SPV | persetujuan (SPV dibatasi wilayah) |
| `GET /dashboard` · `GET /dashboard/export` | ADMIN, SPV | panel dashboard & CSV |
| `POST/DELETE /admin/samples` · `GET /admin/audit` | ADMIN | data contoh, log audit |
| `GET /health` | publik | cek server + database |

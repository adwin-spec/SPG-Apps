# Panduan mengedit aplikasi dengan Python (Antigravity)

Panduan ini untuk Anda yang ingin mengubah aplikasi sendiri. Semua logika bisnis ada di **Python** (`apps/api`).
Frontend (`apps/web`, Next.js/TypeScript) hanya menampilkan apa yang dikirim backend, jadi sebagian besar
perubahan cukup dilakukan di Python.

## 1. Persiapan sekali saja

Pasang di komputer Anda:

| Perangkat | Versi | Untuk |
|---|---|---|
| Python | 3.12 atau 3.13 | backend |
| PostgreSQL | 16 | database (atau jalankan lewat Docker) |
| Node.js + pnpm | Node 22, pnpm 10 | menjalankan tampilan web |
| Git | terbaru | mengambil dan menyimpan kode |
| Antigravity | terbaru | editor + agen AI |

Lalu di Antigravity: **File → Open Folder** → pilih folder repo `SPG-Apps`.
Buka terminal di Antigravity (menu *Terminal → New Terminal*) dan jalankan:

```bash
cd apps/api
python -m venv .venv
```

Aktifkan lingkungan Python (Windows: `.venv\Scripts\activate`, Mac/Linux: `source .venv/bin/activate`), lalu:

```bash
pip install -r requirements-dev.txt
```

Buat database kosong bernama `tanda` di PostgreSQL (user `tanda`, password `tanda`), atau jalankan hanya database lewat Docker:

```bash
docker compose up -d db
```

Lalu buat tabel dan isi awal (wilayah Jawa + DKI dan akun admin):

```bash
alembic upgrade head
```

```bash
ADMIN_PASSWORD='PasswordAdminAnda' python -m app.seed
```

(Di Windows PowerShell: `$env:ADMIN_PASSWORD='PasswordAdminAnda'; python -m app.seed`.)

## 2. Menjalankan di komputer sendiri

Terminal 1 – backend Python (otomatis restart setiap file Python disimpan):

```bash
cd apps/api && uvicorn app.main:app --reload --port 4000
```

Terminal 2 – tampilan web:

```bash
pnpm install && pnpm dev:web
```

Buka http://localhost:3000 dan masuk dengan akun admin. Dokumentasi API interaktif ada di
http://localhost:4000/api/docs.

## 3. Peta file: ubah apa di mana

| Ingin mengubah… | File |
|---|---|
| Pertanyaan form SPG (Grosir, HORECA, Reguler), pilihan jawaban, kapan pertanyaan muncul, wajib/tidak | `apps/api/app/forms.py` |
| Angka & panel dashboard | `apps/api/app/services/dashboard.py` |
| Peringatan otomatis di Persetujuan (mis. "harga eceran < grosir") | `apps/api/app/services/reports.py` → fungsi `flags()` |
| Syarat laporan bisa dikirim | `apps/api/app/services/reports.py` → fungsi `clean_report()` |
| Siapa boleh menyetujui (wilayah supervisor) | `apps/api/app/services/access.py` |
| Data contoh demo | `apps/api/app/routers/admin.py` |
| Struktur tabel database | `apps/api/app/models.py` (+ migrasi, lihat bagian 5) |
| Merek, varian, daftar grosir | tidak perlu kode: menu **Pengaturan** di aplikasi |
| Kecamatan & kab/kota | tidak perlu kode: menu **Wilayah** di aplikasi |

Isian form disimpan sebagai JSON, jadi **menambah/mengubah pertanyaan tidak memerlukan migrasi database**.

## 4. Contoh perubahan

**Menambah pilihan jawaban** – di `forms.py`, tambahkan teks ke daftar di `O`:

```python
"tipeToko": ["Warung Madura", "Kios", "Kelontong", "Kantin", "Toko Grosir Kecil", "Lainnya"],
```

**Menambah pertanyaan baru** di form HORECA (letakkan di urutan yang diinginkan dalam `HORECA_ENTRY`):

```python
q("pekerjaan", "Pekerjaan responden", "single", True,
  options=["Karyawan", "Wiraswasta", "Mahasiswa", "Lainnya"], show=dewasa),
```

**Pertanyaan yang hanya muncul untuk kondisi tertentu**:

```python
q("alasanTidakJual", "Kenapa tidak jual TT?", "single", True,
  options=["Belum ditawari", "Margin kecil", "Lainnya"], show=when("statusOutlet", eq="BELUM")),
```

**Menambah panel dashboard** – di `dashboard.py`, dalam fungsi `horeca()` tambahkan ke daftar `p`:

```python
bars("Pekerjaan responden", "", count(ents, "pekerjaan"), pct=True),
```

Simpan file → server restart otomatis → muat ulang halaman. Form di HP mengambil definisi terbaru saat dibuka.

## 5. Mengubah struktur tabel (jarang diperlukan)

1. Ubah `apps/api/app/models.py`.
2. Buat migrasi otomatis: `alembic revision --autogenerate -m "keterangan singkat"`.
3. Periksa file baru di `apps/api/alembic/versions/`.
4. Terapkan: `alembic upgrade head`.

Jangan pernah mengubah file migrasi yang sudah dipakai di server; selalu buat migrasi baru.

## 6. Menjalankan tes sebelum menyimpan perubahan

Tes memakai database terpisah `tanda_test` (dibuat dan dihapus otomatis, database kerja tidak tersentuh):

```bash
cd apps/api && DATABASE_URL=postgresql+psycopg://tanda:tanda@localhost:5432/tanda_test python -m pytest -q tests
```

Bila Anda menambah pertanyaan **wajib**, tes yang mengirim laporan tanpa jawaban itu akan gagal. Itu wajar:
tambahkan jawaban tersebut ke data tes di `apps/api/tests/test_flow.py`.

## 7. Bekerja dengan agen AI di Antigravity

Agen Antigravity bisa mengedit dan menjalankan perintah. Agar hasilnya aman:

* Beri tugas yang spesifik dan sebut filenya, misalnya: *"Di apps/api/app/forms.py tambahkan pertanyaan
  pilihan tunggal 'Pekerjaan responden' ke HORECA_ENTRY setelah usia, lalu jalankan pytest."*
* Minta agen **menjalankan tes** setelah mengubah kode, dan baca hasilnya sebelum menyetujui.
* Jangan izinkan agen menghapus folder `alembic/versions`, menjalankan `alembic downgrade` di server, atau
  menyentuh file `.env`.
* **Jangan pernah menempel password, token GitHub, atau isi `.env` ke chat agen.**
* Tinjau perubahan di panel *Source Control* sebelum commit.

## 8. Menyimpan dan mengirim ke GitHub

```bash
git checkout -b ubah-form-horeca
```

```bash
git add -A && git commit -m "Tambah pertanyaan pekerjaan responden HORECA"
```

```bash
git push -u origin ubah-form-horeca
```

Buka Pull Request di GitHub; CI otomatis menjalankan semua tes. Gabungkan ke `main` setelah hijau.

## 9. Kalau ada masalah

| Gejala | Penyebab umum |
|---|---|
| `password authentication failed` | DATABASE_URL salah; formatnya `postgresql+psycopg://user:pass@host:5432/nama` |
| Halaman web "Memuat…" terus | backend belum jalan di port 4000 |
| `Tes hanya boleh memakai database *_test` | lupa memberi DATABASE_URL yang berakhiran `_test` saat pytest |
| Pertanyaan baru tidak muncul di HP | server belum restart, atau kondisi `show=` tidak terpenuhi |
| Error 422 "Lengkapi isian" saat kirim | pertanyaan wajib belum dijawab; lihat `details` di respons |

# Mengubah form sendiri, mengembalikan (reset), dan deploy sendiri

Semua langkah di bawah dijalankan di **Terminal Mac** (atau terminal di Antigravity), dari folder aplikasi:

```bash
cd ~/TandaTambah/SPG-Apps-main
```

## 1. Di mana form diubah
Satu file saja: **`apps/api/app/forms.py`**. Buka di Antigravity (File → Open Folder → `SPG-Apps-main`).

| Mau mengubah | Bagian di `forms.py` |
|---|---|
| Teks pertanyaan / petunjuk | baris `q("id", "Teks pertanyaan", ...)` dan `hint="..."` |
| Pilihan jawaban | daftar `O = { ... }` di bagian atas |
| Form Grosir | `GROSIR_START`, `GROSIR_ENTRY`, `GROSIR_SECTIONS`, `GROSIR_CLOSING` |
| Survei HORECA | `HORECA_START`, `HORECA_ENTRY`, `HORECA_CLOSING` |
| Kunjungan Reguler | `REGULER_START`, `REGULER_ENTRY`, `REGULER_CLOSING` |
| Nama kolom di Excel | `_cols(...)` di bagian bawah |

Aturan aman:
* Teks pertanyaan, `hint`, dan `placeholder` boleh diubah bebas.
* Pilihan berbentuk pasangan `("KODE", "Teks")` – ubah **teksnya saja**, jangan kodenya.
* Pilihan teks biasa (`"Kios"`) ikut tersimpan di laporan. Kalau diganti, laporan lama tetap memakai teks lama.
* Menghapus pertanyaan: hapus satu baris `q(...)`-nya. Kalau dashboard punya grafik untuk pertanyaan itu,
  hapus juga barisnya di `apps/api/app/services/dashboard.py` (cari id pertanyaannya).
* Jangan mengubah `id` pertanyaan yang sudah dipakai (mis. `"statusTT"`), karena data lama memakai id itu.

## 2. Menerapkan perubahan
Sebelum menyimpan perubahan, buat cadangan sekali:

```bash
cp apps/api/app/forms.py apps/api/app/forms.backup.py
```

Setelah mengedit, cek tidak ada salah ketik (tidak ada pesan = aman):

```bash
python3 -m py_compile apps/api/app/forms.py
```

Terapkan (± 1 menit):

```bash
docker compose up -d --build api
```

Buka ulang aplikasi di HP / browser (tarik ke bawah atau Cmd+Shift+R). Form baru langsung dipakai.

Kalau ada yang salah, lihat pesannya:

```bash
docker compose logs --tail 50 api
```

## 3. Mengembalikan (reset) perubahan
**Kembali ke cadangan Anda sendiri:**

```bash
cp apps/api/app/forms.backup.py apps/api/app/forms.py && docker compose up -d --build api
```

**Kembali ke versi asli di GitHub (khusus file form):**

```bash
curl -fsSL https://raw.githubusercontent.com/adwin-spec/SPG-Apps/main/apps/api/app/forms.py -o apps/api/app/forms.py && docker compose up -d --build api
```

**Kembalikan seluruh aplikasi ke versi GitHub terbaru** (data & `.env` tetap aman):

```bash
curl -L -o /tmp/tt.zip https://github.com/adwin-spec/SPG-Apps/archive/refs/heads/main.zip && unzip -q -o /tmp/tt.zip -d ~/TandaTambah && docker compose up -d --build
```

⚠️ Perintah terakhir ini juga **menimpa `forms.py` Anda** dengan versi GitHub. Kalau Anda sudah mengubah form
sendiri, simpan dulu cadangannya (`cp apps/api/app/forms.py ~/forms-saya.py`), lalu salin kembali setelah update.

## 4. Deploy sendiri (supaya bukan localhost)

### A. Dari Mac Anda – cepat, gratis
Aplikasi harus sudah berjalan (`docker compose up -d`). Pasang sekali: `brew install cloudflared`. Lalu:

```bash
cloudflared tunnel --url http://localhost:3000
```

Bagikan alamat `https://….trycloudflare.com` yang muncul. Biarkan jendela itu terbuka, dan jaga Mac tetap
menyala dengan `caffeinate -dis` di tab lain. Alamat berganti setiap kali tunnel dijalankan ulang.
Perubahan form di Mac langsung ikut terlihat dari luar setelah langkah 2.

### B. Server sendiri – menyala 24 jam
Siapkan server Ubuntu (Oracle Cloud Free atau VPS), masuk lewat SSH, lalu:

```bash
curl -fsSL https://raw.githubusercontent.com/adwin-spec/SPG-Apps/main/infrastructure/deployment/install.sh -o install.sh
```

```bash
sudo bash install.sh
```

Alamatnya menjadi `https://<ip-server>.nip.io` (atau domain Anda: `sudo bash install.sh spg.namaperusahaan.co.id`).
Server mengambil kode dari GitHub, jadi perubahan form yang Anda buat di Mac **tidak otomatis** ikut ke server.
Pilihannya: ubah langsung di server (`sudo nano /opt/tanda-tambah/apps/api/app/forms.py`, lalu
`cd /opt/tanda-tambah && sudo docker compose up -d --build api`), atau simpan perubahan ke GitHub dulu (lihat
`docs/PANDUAN_PYTHON_ANTIGRAVITY.md` bagian Git) lalu jalankan `sudo bash install.sh` lagi.
Jangan campur dua cara itu: kalau Anda sudah mengubah file langsung di server, `install.sh` bisa gagal saat
mengambil versi baru. Kembalikan dulu file server ke versi GitHub:
`sudo git -C /opt/tanda-tambah checkout -- apps/api/app/forms.py`.
Rincian lengkap: `infrastructure/deployment/DEPLOYMENT.md`.

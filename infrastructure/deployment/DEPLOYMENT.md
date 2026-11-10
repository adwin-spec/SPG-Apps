# Deployment: server + domain

Total waktu ±30 menit. Yang perlu Anda siapkan sendiri (butuh akun & pembayaran atas nama perusahaan):
**1 server VPS** dan **1 nama domain** (atau subdomain dari domain kantor yang sudah ada).

## 1. Pilih server

Spesifikasi minimum: **Ubuntu 24.04 (atau 22.04), 2 vCPU, 4 GB RAM, 40 GB disk** – cukup untuk ±100 SPG.

| Pilihan | Kira-kira biaya | Catatan |
|---|---|---|
| VPS penyedia Indonesia (data center Jakarta) | ± Rp 150–300 rb/bulan untuk 2 vCPU/4 GB | **Disarankan.** Data responden (termasuk foto wajah) tetap di Indonesia, sejalan dengan UU PDP 27/2022; latensi rendah untuk HP SPG |
| DigitalOcean / Vultr / Linode (region Singapura) | ± US$ 24/bulan untuk 4 GB | Mudah dipakai; data di luar Indonesia |
| Oracle Cloud *Always Free* (ARM) | gratis | Tetap butuh verifikasi kartu kredit; kapasitas sering habis; cocok untuk uji coba, bukan produksi |

Harga berubah-ubah; cek di situs penyedia. Saat membuat server, pilih **Ubuntu**, simpan **alamat IP publik**, dan
masuk dengan SSH key (lebih aman daripada password).

## 2. Siapkan domain

* **Paling praktis:** pakai subdomain dari domain kantor yang sudah dimiliki, mis. `spg.namaperusahaan.co.id`.
  Tidak perlu beli apa-apa; cukup minta pengelola DNS kantor menambah satu record.
* **Beli baru:** `.id` atau `.my.id` bisa dibeli di registrar Indonesia; `.co.id` memerlukan dokumen perusahaan (NIB/akta).
* **Tanpa domain (uji coba):** lewati langkah ini; skrip otomatis memakai `<ip-server>.nip.io` (gratis, langsung HTTPS).
  Jangan dipakai untuk produksi karena bergantung pada layanan pihak ketiga.

Di pengaturan DNS domain, buat record:

| Tipe | Nama | Isi | TTL |
|---|---|---|---|
| A | `spg` (atau `@` untuk domain utama) | IP publik server | 300 |

Tunggu beberapa menit, lalu cek: `ping spg.namaperusahaan.co.id` harus menunjukkan IP server.

## 3. Pasang aplikasi (satu perintah)

Masuk ke server lewat SSH, lalu:

```bash
curl -fsSL https://raw.githubusercontent.com/adwin-spec/SPG-Apps/main/infrastructure/deployment/install.sh -o install.sh
```

```bash
sudo bash install.sh spg.namaperusahaan.co.id
```

(Tanpa domain: `sudo bash install.sh`.)

Skrip ini: memasang Docker, menyalakan firewall (hanya SSH, 80, 443), menambah swap bila RAM kecil, mengambil kode,
membuat `.env` berisi password acak, menjalankan database + backend Python + web + HTTPS (Caddy/Let's Encrypt),
dan memasang backup harian. Di akhir, **password admin ditampilkan sekali** – simpan baik-baik.

Bila repo GitHub dijadikan **Private** (disarankan), server perlu izin baca: buat *deploy key* di
GitHub → Settings → Deploy keys, lalu jalankan skrip dengan `REPO=git@github.com:adwin-spec/SPG-Apps.git`.

## 4. Setelah terpasang

1. Buka `https://<domain>`, masuk sebagai `admin`.
2. **SPG & Supervisor** → buat akun supervisor dan SPG, tetapkan tugas dan wilayah.
3. SPG membuka alamat yang sama di HP → *Tambahkan ke layar utama*.

**Memperbarui ke versi terbaru**: jalankan lagi `sudo bash install.sh <domain>` (data dan `.env` tidak ditimpa;
migrasi database jalan otomatis).

**Backup**: setiap hari 01:30 ke `/var/backups/tanda` (database + foto, disimpan 14 hari). Salin berkala ke
tempat lain (mis. penyimpanan cloud kantor) agar aman bila server rusak.
Pulihkan database: `docker compose exec -T db pg_restore -U tanda -d tanda_tambah --clean < /var/backups/tanda/db-TANGGAL.dump`.

**Melihat log**: `cd /opt/tanda-tambah && docker compose logs -f api web`.

## Catatan keamanan

* Port 3000 hanya terbuka untuk server itu sendiri; akses publik hanya lewat HTTPS (443).
* Jangan bagikan isi `/opt/tanda-tambah/.env`.
* Batas percobaan login dihitung per proses API; untuk serangan masif, tambahkan pembatas di firewall/penyedia.

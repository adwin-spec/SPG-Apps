# Deployment: server + domain

Total waktu ±30 menit. Yang perlu Anda siapkan sendiri (butuh akun & pembayaran atas nama perusahaan):
**1 server VPS** dan **1 nama domain** (atau subdomain dari domain kantor yang sudah ada).

## 0. Uji coba gratis (opsional)

Penawaran gratis penyedia cloud sering berubah; periksa syaratnya saat mendaftar.

**A. Laptop kantor + Cloudflare Tunnel** – tanpa kartu kredit, ±20 menit. Laptop harus tetap menyala dan
tidak tidur selama uji coba; alamatnya berganti setiap tunnel dijalankan ulang. Cocok untuk uji 1–2 minggu dengan beberapa SPG.

1. Pasang **Docker Desktop** dan **Git**, lalu ambil kode dan siapkan pengaturan:
```bash
git clone https://github.com/adwin-spec/SPG-Apps.git && cd SPG-Apps && cp .env.example .env
```
2. Buka `.env`, ganti semua `CHANGE_ME` (password bebas, `JWT_SECRET` minimal 32 karakter acak). Biarkan `COOKIE_SECURE=true`.
3. Jalankan aplikasi (tanpa profil https):
```bash
docker compose up -d --build
```
4. Pasang **cloudflared** (unduh dari situs resmi Cloudflare), lalu buat alamat HTTPS publik sementara:
```bash
cloudflared tunnel --url http://localhost:3000
```
5. Bagikan alamat `https://….trycloudflare.com` yang muncul ke SPG dan supervisor.

**B. Oracle Cloud *Always Free*** – server menyala 24 jam, gratis tanpa batas waktu (ARM, hingga 4 OCPU/24 GB),
tetapi pendaftaran butuh verifikasi kartu kredit dan kapasitas di beberapa region sering penuh.

1. Buat instance *Ampere A1* dengan image **Canonical Ubuntu 24.04**, 2 OCPU / 12 GB cukup.
2. Di *Virtual Cloud Network → Security List*, tambah *Ingress Rule* TCP port **80** dan **443** dari `0.0.0.0/0`.
3. SSH ke server lalu jalankan skrip di langkah 3 (tanpa domain: `sudo bash install.sh`, memakai `<ip>.nip.io`).
   Skrip mengenali image Oracle dan membuka port lewat iptables, bukan ufw.

**C. Kredit uji coba Google Cloud / AWS / Azure** – akun baru biasanya mendapat kredit untuk beberapa bulan
(butuh kartu kredit). Pilih VM 2 vCPU/4 GB Ubuntu, buka port 80/443 di firewall penyedia, lalu jalankan skrip
di langkah 3. Pasang pengingat sebelum kredit habis agar tidak tertagih.

Yang tidak disarankan: layanan PaaS gratis (mis. Render/Railway) – database gratisnya terbatas waktu dan file
foto hilang saat layanan restart.

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

#!/usr/bin/env bash
# Pasang Tanda Tambah di server Ubuntu 22.04/24.04 yang masih baru, lengkap dengan HTTPS.
#
#   curl -fsSL https://raw.githubusercontent.com/adwin-spec/SPG-Apps/main/infrastructure/deployment/install.sh -o install.sh
#   sudo bash install.sh app.domainanda.id        # dengan domain sendiri (arahkan DNS A-record ke IP server dulu)
#   sudo bash install.sh                          # tanpa domain: memakai <ip>.nip.io (gratis, untuk uji coba)
#
# Aman dijalankan ulang (untuk memperbarui ke versi terbaru): .env dan data tidak ditimpa.
set -euo pipefail

REPO="${REPO:-https://github.com/adwin-spec/SPG-Apps.git}"
DIR="${DIR:-/opt/tanda-tambah}"
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }
. /etc/os-release; [ "${ID:-}" = ubuntu ] || echo "Peringatan: skrip ini diuji untuk Ubuntu; OS Anda: ${PRETTY_NAME:-?}"

IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${1:-${IP//./-}.nip.io}"
echo "==> Server $IP · domain $DOMAIN"

echo "==> Paket dasar, firewall, swap"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl openssl ca-certificates >/dev/null
if [ -f /etc/iptables/rules.v4 ] && grep -q InstanceServices /etc/iptables/rules.v4; then
  # Oracle Cloud: image Ubuntu-nya sudah memakai iptables sendiri; Oracle menyarankan TIDAK memakai ufw.
  # Buka 80/443 di iptables (port juga harus dibuka di Security List / NSG pada konsol Oracle).
  for p in 443 80; do iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp -m state --state NEW --dport $p -j ACCEPT; done
  netfilter-persistent save >/dev/null 2>&1 || true
else
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
fi
# Build frontend butuh ±2 GB RAM; tambah swap bila RAM kecil.
if [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 3500 ] && ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null

echo "==> Kode aplikasi di $DIR"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"

NEW_ADMIN_PW=""
if [ ! -f .env ]; then
  echo "==> Membuat .env dengan rahasia acak"
  NEW_ADMIN_PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  cat > .env <<ENV
POSTGRES_USER=tanda
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=tanda_tambah
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$NEW_ADMIN_PW
COOKIE_SECURE=true
SITE_DOMAIN=$DOMAIN
WEB_PORT=3000
WEB_BIND=127.0.0.1
ENV
  chmod 600 .env
else
  sed -i "s|^SITE_DOMAIN=.*|SITE_DOMAIN=$DOMAIN|" .env
fi

echo "==> Build & jalankan (beberapa menit saat pertama kali)"
docker compose --profile https up -d --build

echo "==> Backup harian 01:30 (database + foto, disimpan 14 hari di /var/backups/tanda)"
mkdir -p /var/backups/tanda
cat > /etc/cron.d/tanda-backup <<CRON
30 1 * * * root cd $DIR && docker compose exec -T db sh -c 'pg_dump -U \$POSTGRES_USER -Fc \$POSTGRES_DB' > /var/backups/tanda/db-\$(date +\%F).dump && docker run --rm -v tanda-tambah_photos:/d:ro -v /var/backups/tanda:/b alpine tar czf /b/photos-\$(date +\%F).tgz -C /d . && find /var/backups/tanda -mtime +14 -delete
CRON

echo "==> Menunggu aplikasi siap"
for i in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:3000/login" && break; sleep 5; done

echo
echo "Selesai. Buka: https://$DOMAIN   (sertifikat HTTPS dibuat otomatis, bisa butuh 1-2 menit)"
if [ -n "$NEW_ADMIN_PW" ]; then
  echo "Login admin  : admin"
  echo "Password     : $NEW_ADMIN_PW"
  echo "Simpan password ini sekarang; tidak akan ditampilkan lagi (tersimpan di $DIR/.env)."
fi

#!/usr/bin/env bash
# PostgreSQL backup (custom format, compressed) with retention. Schedule daily, e.g. cron "30 1 * * *".
#   DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/tanda RETENTION_DAYS=30 ./backup-db.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"; RETENTION_DAYS="${RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; FILE="$BACKUP_DIR/tanda_tambah_${STAMP}.dump"
URL="${DATABASE_URL%%\?*}"; URL="${URL/+psycopg/}"   # format SQLAlchemy → format pg_dump
pg_dump --format=custom --compress=9 --no-owner --file="$FILE" "$URL"
pg_restore --list "$FILE" > /dev/null   # verify the archive is readable
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'tanda_tambah_*.dump*' -mtime +"$RETENTION_DAYS" -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
# Optional off-site copy: aws s3 cp "$FILE" "s3://$BACKUP_BUCKET/db/" --sse AES256

#!/usr/bin/env bash
# Restore a backup into a TARGET database (never run blindly against production; see DEPLOYMENT.md §Recovery).
#   TARGET_DATABASE_URL=postgresql://.../tanda_tambah_restore ./restore-db.sh backups/tanda_tambah_<stamp>.dump
set -euo pipefail
FILE="${1:?usage: restore-db.sh <dump-file>}"; : "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
URL="${TARGET_DATABASE_URL%%\?*}"; URL="${URL/+psycopg/}"
read -r -p "Restore $FILE into $URL ? This replaces existing objects. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Aborted"; exit 1; }
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$URL" "$FILE"
echo "Restore complete. Verify with: psql \"$URL\" -c 'select count(*) from _prisma_migrations'"

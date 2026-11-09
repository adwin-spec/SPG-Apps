# Deployment, operations, backup & recovery

## Topology

```
Internet ─HTTPS─► Caddy (TLS, HSTS) ─► web (Next.js, :3000) ─/api/v1 proxy─► api (NestJS, :4000) ─► PostgreSQL 16
                                                                            worker (BullMQ)      ─► Redis 7
                                                                                                 ─► S3 / MinIO (photos, forms)
                                                                                                 ─► Google Drive/Sheets/Vision (optional)
```

The browser only talks to the web origin; the refresh-token cookie is first-party, `httpOnly`, `Secure`, `SameSite=Strict`.

## First deployment

1. Provision a host with Docker Compose v2 (or a managed PostgreSQL 16, Redis 7 and S3 bucket – then remove those services and point the env vars at them).
2. `cp .env.example .env`; generate secrets: `openssl rand -base64 48` for `JWT_ACCESS_SECRET`; strong `POSTGRES_PASSWORD`, `S3_*`, `SEED_SUPERADMIN_PASSWORD`. Set `CORS_ORIGINS=https://<domain>`, `COOKIE_SECURE=true`.
3. `SITE_DOMAIN=<domain> docker compose --profile https up -d --build`. The `migrate` job applies migrations and the **reference** seed (no demo data).
4. Log in as the super admin, change the password, create users/SPGs/outlets, and review every *simulation default* in System Settings and KPI configuration before go-live.
5. Optional: set `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, `GOOGLE_DRIVE_INBOX_FOLDER_ID`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `OCR_PROVIDER=google_vision`; share the Drive folder and Sheet with the service-account e-mail.

Upgrades: `git pull && docker compose up -d --build` – `migrate` runs before `api`/`worker` start (forward-only migrations).

## Monitoring

* Liveness `GET /api/v1/health/live`, readiness `GET /api/v1/health/ready` (DB + Redis) – wired to Docker health checks.
* Operational dashboard (`/overview/operational`): missing check-ins, failed syncs, OCR backlog, pending approvals.
* `Integrations → Google` shows sync jobs and integration logs; `Data Quality` shows rule findings.
* Logs: `docker compose logs -f api worker` (structured Nest logs, no secrets or stack traces sent to clients).
* Recommended: ship container logs to your log platform and alert on readiness failures and `SYNC_FAILED` counts.

## Backup

* **Database**: `infrastructure/scripts/backup-db.sh` – `pg_dump` custom format, archive verified with `pg_restore --list`, SHA-256 checksum, retention (`RETENTION_DAYS`, default 30). Schedule daily (cron `30 1 * * *` WIB) and copy off-site (the script has an S3 example). Tested: backup → restore round trip reproduces row counts and all integrity triggers.
* **Object storage**: enable bucket versioning and replication (S3) or `mc mirror` (MinIO) to a second location.
* **Redis**: AOF enabled; it holds only caches and job queues (re-creatable), not records of truth.
* Targets (proposal – confirm with the business): RPO ≤ 24 h (daily dump) or ≤ 5 min with PostgreSQL WAL archiving / managed PITR; RTO ≤ 4 h.

## Recovery procedure

1. Declare incident; stop writers: `docker compose stop api worker`.
2. Pick the backup; verify checksum: `sha256sum -c <file>.sha256`.
3. Restore into a **new** database first: `TARGET_DATABASE_URL=…/tanda_tambah_restore infrastructure/scripts/restore-db.sh <file>`.
4. Validate: `_prisma_migrations` complete, row counts for `retailer_transactions`, `audit_logs`, a sample of recent approvals.
5. Point `DATABASE_URL` to the restored database (or rename databases), `docker compose up -d api worker`.
6. Ask SPGs to open the app: their offline outboxes re-send pending work; idempotency keys prevent duplicates of anything already restored.
7. Record the incident and the restore point in the audit/incident log.

## Security checklist (implemented)

| Control | Where |
|---|---|
| HTTPS + HSTS | Caddy profile; `COOKIE_SECURE` enforced in production by env validation |
| Argon2id password hashing, lockout after 5 failures (15 min), generic error messages, constant-time path for unknown users | `apps/api/src/auth` |
| Short-lived JWT (HS256, 15 min) in memory only; rotated refresh tokens (hashed, family revocation on reuse) | `auth.service.ts`, `lib/api.ts` |
| RBAC with **deny-by-default** (endpoints without a permission declaration are refused) + row-level scope | `common/guards/auth.guard.ts`, `common/scope` |
| Rate limiting (Redis-backed, stricter on login) | `RedisThrottlerStorage`, `@Throttle` |
| Input validation (Zod) on every body/query; parameterised SQL only (Prisma / `Prisma.sql`) | `common/pipes/zod.pipe.ts`, analytics |
| CORS allow-list, Helmet headers, `X-Frame-Options: DENY`, no `x-powered-by` | `bootstrap.ts`, `next.config.ts` |
| Upload validation by magic bytes, size limit, private storage keys, files streamed only after scope check | `common/storage`, `files.controller.ts` |
| CSV formula-injection guard on exports | `reports.service.ts` |
| Append-only audit log & OCR output, no deletes of transactions (DB triggers) | migration `integrity_rules` |
| No secrets in the repository (`.env*` ignored; CI secret scan); env validated at boot | `config/env.ts`, `.gitignore`, CI |

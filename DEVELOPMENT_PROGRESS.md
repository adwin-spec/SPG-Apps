# DEVELOPMENT_PROGRESS

_Last update: 2026-11-09 · branch `main`_

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| 1 Foundation (monorepo, Next.js, NestJS, Prisma/PostgreSQL, Redis, auth, RBAC, org/SPG/outlet/product masters, admin dashboard, Swagger) | ✅ Done | API boots, migrations applied, login/RBAC tests, Swagger `/api/docs` |
| 2 Field operation (attendance, GPS/geofence, visits, plans, daily reports, photo upload, offline PWA, sync) | ✅ Done | e2e: idempotent replay, geofence, offline visit → synced exactly once (Playwright, production build + service worker) |
| 3 Business modules (Grosir / HORECA / Reguler, transactions, retailers, competitors, availability, visibility, programs) | ✅ Done | e2e: duplicates, corrections, maker-checker, scope |
| 4 KPI engine (config, versions, weights, targets, scoring, ranking, snapshots, lock) | ✅ Done | unit tests (scoring) + e2e (per-category KPIs, NO_DATA/NO_TARGET/ZERO_TARGET, approved-only) |
| 5 BI (executive, SPG performance, market intelligence, operational, data quality, drill-down, 15 reports, Excel/CSV/PDF) | ✅ Done | e2e: filter consistency, export = preview, scoped exports |
| 6 OCR & integration (upload/Drive → worker → OCR_RAW → review → approval → transaction; Sheets mirror) | ✅ Done (Google not exercised) | e2e: OCR never final without second approver; worker processed real jobs |
| 7 Production readiness (security, tests, perf, Docker, CI, backup/recovery, docs) | 🟡 Mostly | see *Not yet verified* |

## Tests last run (all passing)

* `packages/shared` unit – 11 · `apps/api` unit – 9 (KPI scoring, OCR parser)
* `apps/api` e2e – **23** (the 12 mandatory scenarios + refresh-token reuse, maker-checker, input validation, upload type, approvals scope, duplicate outlets)
* `apps/web` Playwright – **6** (every management page renders without runtime errors, role-based menus, supervisor scope, URL filters + export, transaction drill-down, offline SPG visit synced exactly once)
* Performance (20 concurrent users, 200 req/endpoint): all p95 ≤ 1.03 s, 0 errors (executive dashboard slowest: p50 743 ms / p95 1022 ms)
* Backup → restore round trip: identical row counts and triggers
* `next build`: 44 routes compile & type-check

## Migrations applied
`20261109081859_init`, `20261109090000_integrity_rules`, `20261109100000_document_sequences`

## Not yet verified in this environment (honest gaps)
1. **Docker images / compose and the GitHub Actions workflow were written but not executed** – the build container has no Docker daemon and the repository has no remote yet. Compose/CI YAML is syntax-checked.
2. **No public deployment URL** (Phase 7 acceptance) – needs your server/cloud account and domain; follow `infrastructure/deployment/DEPLOYMENT.md`.
3. **Google Drive / Sheets / Vision** code paths are implemented but untested without a service account (OCR tested with `OCR_PROVIDER=none` = manual transcription).

## Known limitations / next tasks (priority order)
1. Run CI + Docker build on GitHub; deploy staging; confirm all *simulation default* settings, KPI weights and real targets with management.
2. Executive dashboard: pre-aggregate daily facts (materialised view refreshed by the worker) if data volume grows (> ~1 M lines) – currently p95 ≈ 1 s.
3. Geographic view uses a coordinate scatter (no basemap) – choose a tile provider/licence before adding a map layer.
4. UI gaps: editing custom-role permissions (API `PUT /roles/:id/permissions` exists), "create supervisor record" dialog (API exists), outlet assignment history shows SPG id not name, OCR review retailer picker capped at 200 per wholesaler.
5. Coverage KPIs use the **current** outlet assignment, not the assignment valid on each day.
6. Email / WhatsApp channels for notifications (brief: later stage) – events and routing rules already exist.
7. Registering a new retailer from the phone requires connectivity (server-side duplicate check by design).

## Technical decisions to keep (see docs/architecture/ARCHITECTURE.md)
Modular monolith + separate worker process · PostgreSQL as single source of truth (Sheets = mirror) · unified `outlets` table ·
shared Zod schemas · three-layer validation status with corrections as new records · DB triggers for append-only/frozen data ·
deny-by-default RBAC + server-side row scope · client UUID + Idempotency-Key for every offline write · optimistic locking ·
access token in memory, rotated httpOnly refresh cookie · KPI metrics as a server-side SQL catalogue (no user SQL/eval) ·
missing data/undefined targets are never scored as zero · UTC storage, Asia/Jakarta business dates.

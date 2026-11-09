# Tanda Tambah – SPG Performance & Market Intelligence System

Centralised platform for **SPG Grosir, SPG HORECA and SPG Reguler**: field force management (attendance, GPS,
visits, offline PWA), sales & transactions, competitor/market intelligence, a configurable KPI engine,
BI dashboards with drill-down and exports, OCR of paper forms with human validation, data-quality governance
and a full audit trail.

| | |
|---|---|
| **Architecture** | Modular monolith – NestJS API + BullMQ worker, Next.js web (management UI + SPG PWA), PostgreSQL, Redis, S3 storage → [ADR](docs/architecture/ARCHITECTURE.md) |
| **Database** | 65 tables, migrations, integrity triggers → [docs/database](docs/database/DATABASE.md) |
| **API** | 151 endpoints under `/api/v1`, Swagger at `/api/docs` → [docs/api](docs/api/API.md) |
| **Users** | [User guide](docs/user-guide/USER_GUIDE.md) |
| **Ops** | [Deployment, backup & recovery, security](infrastructure/deployment/DEPLOYMENT.md) |
| **Status** | [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md) |

## Repository layout

```
apps/api            NestJS modular monolith (src/<module>), worker entry src/main.worker.ts, e2e tests in test/
apps/web            Next.js 15 – management web (app/(management)/…) and SPG PWA (app/m + features/mobile)
packages/shared     RBAC catalogue, configurable settings, KPI metric catalogue, Zod validation, utils (geo, time, math)
packages/database   Prisma schema, migrations, reference seed, DEMO seed (dev only)
infrastructure      Dockerfiles, Caddy (HTTPS), backup/restore & performance scripts
docs                architecture, database, api, user guide
```

> The brief proposed `packages/shared-types`, `packages/validation`, `packages/config`; they are folders inside
> **one** `@tanda/shared` package (`src/types`, `src/validation`, `src/config`) so the API and web consume a single,
> versioned build. Business modules live in `apps/api/src/<module>` as listed in the ADR.

## Run locally (without Docker)

Requirements: Node ≥ 22, pnpm 10, PostgreSQL 16, Redis 7.

```bash
pnpm install
```

```bash
cp .env.example apps/api/.env      # set DATABASE_URL, JWT_ACCESS_SECRET (≥32 chars), REDIS_URL
```

```bash
cp .env.example packages/database/.env   # only DATABASE_URL is needed here
```

```bash
pnpm build:shared && pnpm db:generate && pnpm db:migrate
```

```bash
SEED_SUPERADMIN_PASSWORD='YourStrongPass1' pnpm db:seed      # roles, permissions, settings, simulation KPIs, super admin
```

```bash
pnpm db:seed:demo        # OPTIONAL demo data (refuses to run when NODE_ENV=production)
```

Start the three processes (separate terminals):

```bash
pnpm dev:api        # http://localhost:4000  (Swagger: /api/docs)
```

```bash
pnpm dev:worker     # BullMQ consumers + schedules (OCR, Drive polling, nightly KPI, DQ scan, notifications)
```

```bash
echo 'API_INTERNAL_URL=http://localhost:4000' > apps/web/.env.local && pnpm dev:web   # http://localhost:3000
```

**Demo accounts** (demo seed only, password `Demo12345!`):
`admin@demo.tanda-tambah.local`, `national@…`, `rm.jatim@…`, `am.sby@…`, `spv1.sby@…`, `analyst@…`, `viewer@…`,
SPG: `demo-spg-001@…` (Grosir), `demo-spg-003@…` (HORECA), `demo-spg-005@…` (Reguler) – all `@demo.tanda-tambah.local`.
SPG accounts land in the mobile app at `/m` (open on a phone or use the browser's device mode).

## Run with Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, SEED_SUPERADMIN_PASSWORD
```

```bash
docker compose up -d --build
```

```bash
SITE_DOMAIN=spg.example.co.id docker compose --profile https up -d   # Caddy with automatic HTTPS
```

## Tests

```bash
pnpm test                 # unit: shared utils/validation + KPI scoring + OCR parser
```

```bash
pnpm test:e2e:api         # 23 API e2e tests incl. the 12 mandatory scenarios (needs DB "tanda_tambah_test")
```

```bash
pnpm test:e2e:web         # Playwright: role menus, every page renders, exports, offline SPG flow (API+web running)
```

```bash
node infrastructure/scripts/perf-test.mjs http://localhost:4000/api/v1 20 200   # load test
```

## Configurable business rules

Nothing undecided is hard-coded. KPI definitions, formulas, weights, caps and targets are managed in
**KPI & Performance**; operational rules (geofence radius, deadlines, final statuses, missing-data policy,
duplicate threshold, notification routing, Google Sheet/column mapping) are in **System Settings** and are
flagged *simulation default* until an administrator confirms them. See ADR §1.1.

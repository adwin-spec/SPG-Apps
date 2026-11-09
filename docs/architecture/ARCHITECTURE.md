# Tanda Tambah – SPG Performance & Market Intelligence System
## Architecture Decision Record (ADR) & Requirement Analysis

Status: **Accepted** · Owner: Engineering · Timezone policy: store UTC, display Asia/Jakarta

---

## 1. Requirement analysis (Step 1)

### 1.1 Business assumptions that are NOT yet decided by management

None of these are hard-coded. Each is stored as configuration (`system_settings`, KPI tables or
master data) and seeded with a clearly-labelled **simulation default** that an administrator must
confirm before go-live.

| # | Undecided business rule | How the system handles it | Seed default (simulation only) |
|---|---|---|---|
| A1 | KPI list, formulas and weights per SPG category | `kpi_definitions`, `kpi_formulas`, `kpi_weights` (versioned, effective-dated) | Weights from brief: 20/20/25/15/10/10 |
| A2 | Monthly targets per KPI / per SPG | `targets` (category default) + `target_assignments` (per-SPG override), history kept | **No targets seeded** – "undefined" ≠ 0 |
| A3 | Achievement cap (e.g. 100% / 120%) | `kpi_formulas.achievement_cap_pct` (nullable = uncapped) | 100 |
| A4 | Performance status bands | `kpi.performanceBands` setting | ≥90 Good, ≥70 Watch, <70 Critical |
| A5 | Which validation status counts toward final KPI | `kpi.finalStatuses` setting | `APPROVED` only |
| A6 | Missing-KPI-data policy | `kpi.missingDataPolicy` = `EXCLUDE_AND_RENORMALIZE` \| `EXCLUDE_NO_RENORMALIZE` | `EXCLUDE_AND_RENORMALIZE` (coverage is shown) |
| A7 | Geofence radius | `outlets.geofence_radius_m` override, else `attendance.defaultGeofenceRadiusM` | 150 m |
| A8 | Out-of-geofence check-in policy | `attendance.outsideGeofencePolicy` = `FLAG` \| `BLOCK` | `FLAG` (supervisor reviews) |
| A9 | Daily report deadline (late report) | `reporting.dailyDeadlineLocalTime` | 21:00 WIB |
| A10 | Minimum effective visit duration | `visits.minEffectiveDurationMin` | 5 min |
| A11 | Retailer "active" window | `wholesale.activeRetailerWindowDays` | 30 days |
| A12 | Outlet potential classes | `outlets.potentialClasses` (list) | A, B, C, D |
| A13 | Duplicate-retailer similarity threshold | `retailers.duplicateSimilarityThreshold` | 0.55 (pg_trgm) |
| A14 | OCR auto-approval | **Not allowed by design.** OCR always needs human approval. | n/a |
| A15 | Google Sheet names & column mapping | `integrations.googleSheets.mapping` setting | FILE_LOG, OCR_RAW, INPUT_HARIAN, TRANSACTION_DB |

### 1.2 Metric vocabulary (non-interchangeable)

| Term | Definition (configurable windows in brackets) |
|---|---|
| Registered retailer | Retailer row exists with `status != CLOSED` |
| Visited retailer | ≥1 completed visit in period |
| Active retailer | ≥1 transaction (any product) in the last [A11] days |
| Productive retailer | ≥1 *approved* transaction in period |
| Company-product buying retailer | ≥1 approved transaction line where `product_owner = COMPANY` in period |
| Effective visit | Completed visit with duration ≥ [A10] and ≥1 business record (order/transaction/availability/visibility/competitor) |
| Productive visit | Completed visit that produced an order/sale/transaction |

### 1.3 Data nature (never mixed in "sales")

`ACTUAL` (evidence-backed transaction) · `ESTIMATE` (SPG/PIC estimate) · `OBSERVATION` (seen, not
transacted). Sales KPIs only use `ACTUAL` + final validation status.

---

## 2. Architecture (Step 2)

### 2.1 Style: **Modular monolith**
One NestJS deployable with strict module boundaries (each module owns its controller/service/DTO and
talks to others only through exported services). One PostgreSQL database. A separate **worker
process** (same codebase, `main.worker.ts`) consumes BullMQ queues (OCR, Drive polling, KPI
recalculation, notifications). This gives microservice-like isolation of heavy jobs without
distributed-transaction cost.

```
 Browser (Management Web)  ─┐                       ┌─ Worker (BullMQ: ocr, drive-sync, kpi, notify)
 Phone   (SPG PWA, offline) ─┼─► Next.js (3000) ─/api/v1 proxy─► NestJS API (4000) ─┤
                             │   same-origin, httpOnly refresh cookie               ├─ PostgreSQL 16 (system of record)
                             │                                                       ├─ Redis (cache, queues, rate-limit)
                             │                                                       └─ S3-compatible storage (photos/docs)
 Google Drive / Sheets  ◄────┴──────────────── integration adapters (source only, never the DB)
```

### 2.2 Stack (as mandated)
Next.js 15 + React 19 + TypeScript · Tailwind CSS · shadcn/ui-style components (Radix primitives, code
owned in repo) · Apache ECharts · TanStack Table/Query · React Hook Form + Zod · NestJS 11 · Prisma 6 ·
PostgreSQL 16 · Redis 7 · BullMQ · S3 (MinIO in dev compose; `local` driver for tests) · PWA +
IndexedDB · Jest + Playwright · Docker · GitHub Actions · Swagger.

Version note: Prisma's npm `latest` tag pointed to a release candidate (8.0.0-rc) at build time; the
project pins the stable **6.19** line. NestJS 12 / Next 16 were available but the project pins the
LTS-proven 11 / 15 lines to reduce integration risk.

### 2.3 Key decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | **Unified `outlets` table** with `channel` ∈ {WHOLESALER, RETAILER, HORECA, REGULAR}; wholesaler/retailer-specific behaviour lives in services + `retailer_wholesale_relationships` | Visits, GPS, assignment, history and drill-down work identically for every outlet type; no polymorphic FK. Replaces separate `wholesalers`/`retailers` tables (documented deviation). |
| D2 | **Shared Zod schemas** (`@tanda/shared`) used by both the API (custom `ZodValidationPipe`) and web forms (React Hook Form) | One source of truth for validation; Swagger schemas generated from Zod (`z.toJSONSchema`). |
| D3 | **Competitor intelligence in one table** `competitor_observations` (with `channel`), and competitor *purchases* as `retailer_transaction_items.product_owner = COMPETITOR` | Single analytical grain; removes the need for a separate `competitor_transactions` table that would duplicate purchase lines. |
| D4 | **Three-layer data state**: `SUBMITTED` (raw) → `VALIDATED`/`NEEDS_REVIEW` (automated rules) → `APPROVED` (human). Corrections create a *new* record (`correction_of_id`), original becomes `SUPERSEDED`; reversals create a negating record. | Raw is never mutated; full audit trail; KPI uses final layer only. |
| D5 | **Row-level scope** resolved per request by `ScopeService` (SPG → self, Supervisor → own SPGs, Area/Regional Manager → their territory, National/Admin/Analyst/Viewer → all) and applied in every query | Enforced server-side, testable, cacheable in Redis. |
| D6 | **KPI metrics are a server-side catalogue** of safe, parameterised SQL metrics (`metricKey`); admins compose KPIs from catalogue entries with params, target, weight, cap, direction | KPIs configurable without code changes **and** without exposing arbitrary SQL/eval. |
| D7 | **Idempotency**: every mobile write carries a client-generated UUID (`client_id`, unique) and `Idempotency-Key` header; replays return the original response | Offline sync can never double-insert. |
| D8 | **Optimistic concurrency**: mutable masters carry `version`; updates send `expectedVersion`; mismatch → HTTP 409 with server copy | No silent overwrites (offline conflict resolution). |
| D9 | **Append-only enforcement in the database**: triggers block `DELETE` on transactional tables and any `UPDATE/DELETE` on `audit_logs`, `ocr_raw` | Defence in depth beyond application code. |
| D10 | Access token (15 min) in memory only; refresh token (7 d) in `httpOnly; SameSite=Strict` cookie, **rotated** on each use, reuse ⇒ whole token family revoked | Mitigates XSS token theft and replay. Web proxies `/api/v1` so the cookie stays first-party. |
| D11 | Password hashing **Argon2id** | Brief requirement; memory-hard. |
| D12 | Files in object storage; DB stores metadata + SHA-256 checksum | Brief requirement; checksum powers exact-duplicate detection. |

### 2.4 Organisation hierarchy

`companies → regions → areas → districts (Kabupaten) → subdistricts (Kecamatan)`;
`territories` group coverage inside an area; `supervisors` are users bound to an area;
`spg_assignments` is the effective-dated history of SPG ↔ supervisor/area/territory.

### 2.5 API structure

`/api/v1/<module>` · JSON envelope `{ data, meta? }` · errors `{ error: { code, message, details? }, statusCode }`
· list endpoints accept `page`, `pageSize` (≤200), `sort`, filters · Swagger at `/api/docs`.

---

## 3. Critical architecture review (Step 3)

| Risk found | Mitigation applied |
|---|---|
| R1 Dashboards that aggregate in the browser will not scale | All aggregation is SQL on the server; list endpoints paginate; dashboards fetch aggregates only. |
| R2 "Missing data = 0" would unfairly penalise SPGs | KPI results carry `data_status` (OK / NO_DATA / NO_TARGET / ZERO_TARGET); NO_DATA is excluded, never scored as 0. |
| R3 Division by zero in achievement / Share of Shelf | Central `safeDivide`; SoS with `total_category_facing = 0` is stored NULL, not 0. |
| R4 Target 0 vs. undefined target conflated | Undefined = no row; explicit 0 = `ZERO_TARGET` status, achievement NULL with reason. |
| R5 Same transaction counted twice (OCR + manual, or offline replay) | `client_id` unique, file checksum unique per log, duplicate classifier (EXACT / POTENTIAL / REUPLOAD / CORRECTED); KPI queries exclude `SUPERSEDED/REVERSED/REJECTED` and duplicates flagged EXACT. |
| R6 Retailer master pollution from spelling variants | `normalized_name` + `pg_trgm` similarity search on create; API returns candidates and requires explicit `confirmNotDuplicate`. |
| R7 GPS privacy | GPS captured only at check-in/out & evidence events (no background tracking); purpose text shown in the PWA. |
| R8 Supervisor override abuse | Overrides require reason, are audited and appear in the operational dashboard. |
| R9 Clock skew on offline devices | Server stores both `client_recorded_at` and `server_received_at`; lateness is computed from client time but flagged if skew > 2 h. |
| R10 Docker unavailable in build container | Compose/Dockerfiles are provided; local verification runs services natively (documented). |

# API Reference

Base URL: `/api/v1` · Interactive docs (Swagger UI): `/api/docs` · Machine-readable: [`openapi.json`](./openapi.json) (regenerate with `curl http://localhost:4000/api/docs-json -o docs/api/openapi.json`).

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <access token>` (15 min). Refresh via `POST /auth/refresh` with the httpOnly `tt_rt` cookie (rotated on every use; reuse revokes the session family). |
| Authorization | Every endpoint declares required permissions (RBAC); endpoints without a declaration are denied by default. Row-level scope (SPG → own, Supervisor → own team, Area/Regional manager → territory) is applied server-side. |
| Envelope | Success: `{ "data": …, "meta"?: { page, pageSize, total, totalPages } }` · Error: `{ "statusCode", "error": { "code", "message", "details"? } }` |
| Validation | Shared Zod schemas (`@tanda/shared`); `400 VALIDATION_FAILED` lists field errors. Empty query parameters mean "no filter". |
| Pagination | `page`, `pageSize` (≤ 200), `sort=field:asc|desc` (whitelisted), `q` (search). |
| Idempotency | Mobile writes send `Idempotency-Key` and a client UUID `clientId`; replays return the original response (`Idempotent-Replay: true`). |
| Concurrency | Mutable masters require `expectedVersion`; a stale version returns `409 VERSION_CONFLICT` with the current record. |
| Status codes | 200/201 OK · 400 validation · 401 unauthenticated · 403 permission/scope · 404 not found or out of scope · 409 conflict/duplicate/integrity rule · 422 business rule · 429 rate limit |
| Time | Timestamps are UTC ISO-8601; business dates (`YYYY-MM-DD`) are Asia/Jakarta. |

## Endpoints (151)

| Module | Method | Path |
|---|---|---|
| Analytics & Dashboards | GET | `/analytics/drilldown` |
| Analytics & Dashboards | GET | `/analytics/executive` |
| Analytics & Dashboards | GET | `/analytics/market` |
| Analytics & Dashboards | GET | `/analytics/operational` |
| Approvals | GET | `/approvals` |
| Approvals | POST | `/approvals/{id}/decision` |
| Attendance | GET | `/attendance` |
| Attendance | POST | `/attendance/check-in` |
| Attendance | POST | `/attendance/check-out` |
| Attendance | GET | `/attendance/missing` |
| Attendance | POST | `/attendance/override` |
| Attendance | GET | `/attendance/today` |
| Audit | GET | `/audit-logs` |
| Auth | POST | `/auth/change-password` |
| Auth | POST | `/auth/login` |
| Auth | POST | `/auth/logout` |
| Auth | GET | `/auth/me` |
| Auth | POST | `/auth/refresh` |
| Competitor Intelligence | POST | `/competitor-observations` |
| Competitor Intelligence | GET | `/competitor-observations` |
| Daily Reports | POST | `/daily-reports` |
| Daily Reports | GET | `/daily-reports` |
| Daily Reports | POST | `/daily-reports/{id}/review` |
| Data Quality | GET | `/data-quality/issues` |
| Data Quality | PATCH | `/data-quality/issues/{id}` |
| Data Quality | POST | `/data-quality/scan` |
| Data Quality | GET | `/data-quality/summary` |
| Field (SPG mobile) | GET | `/field/bootstrap` |
| Files | POST | `/files` |
| Files | GET | `/files/{id}/content` |
| Health | GET | `/health/live` |
| Health | GET | `/health/ready` |
| Integrations (Google Drive / Sheets) | POST | `/integrations/drive/sync` |
| Integrations (Google Drive / Sheets) | GET | `/integrations/logs` |
| Integrations (Google Drive / Sheets) | POST | `/integrations/sheets/sync` |
| Integrations (Google Drive / Sheets) | GET | `/integrations/status` |
| Integrations (Google Drive / Sheets) | GET | `/integrations/sync-jobs` |
| KPI & Performance | GET | `/performance` |
| KPI & Performance | POST | `/performance/lock` |
| KPI & Performance | GET | `/performance/me` |
| KPI & Performance | POST | `/performance/recalculate` |
| KPI & Performance | GET | `/performance/spgs/{id}` |
| KPI Configuration | GET | `/kpi/definitions` |
| KPI Configuration | POST | `/kpi/definitions` |
| KPI Configuration | PATCH | `/kpi/definitions/{id}` |
| KPI Configuration | POST | `/kpi/definitions/{id}/formulas` |
| KPI Configuration | GET | `/kpi/definitions/{id}/history` |
| KPI Configuration | POST | `/kpi/definitions/{id}/weights` |
| KPI Configuration | GET | `/kpi/metrics` |
| KPI Configuration | GET | `/kpi/targets` |
| KPI Configuration | PUT | `/kpi/targets` |
| Notifications | GET | `/notifications` |
| Notifications | POST | `/notifications/read` |
| Notifications | POST | `/notifications/scan` |
| Notifications | GET | `/notifications/unread-count` |
| OCR – Paper forms | GET | `/ocr/file-logs` |
| OCR – Paper forms | GET | `/ocr/file-logs/{id}` |
| OCR – Paper forms | POST | `/ocr/file-logs/{id}/reject` |
| OCR – Paper forms | POST | `/ocr/file-logs/{id}/retry` |
| OCR – Paper forms | POST | `/ocr/file-logs/{id}/reviews` |
| OCR – Paper forms | GET | `/ocr/file-logs/status-counts` |
| OCR – Paper forms | POST | `/ocr/reviews/{id}/decision` |
| OCR – Paper forms | POST | `/ocr/uploads` |
| Organization | GET | `/organization/areas` |
| Organization | POST | `/organization/areas` |
| Organization | PATCH | `/organization/areas/{id}` |
| Organization | GET | `/organization/districts` |
| Organization | POST | `/organization/districts` |
| Organization | GET | `/organization/regions` |
| Organization | POST | `/organization/regions` |
| Organization | PATCH | `/organization/regions/{id}` |
| Organization | GET | `/organization/subdistricts` |
| Organization | POST | `/organization/subdistricts` |
| Organization | GET | `/organization/supervisors` |
| Organization | POST | `/organization/supervisors` |
| Organization | GET | `/organization/territories` |
| Organization | POST | `/organization/territories` |
| Organization | GET | `/organization/tree` |
| Outlets | GET | `/outlets` |
| Outlets | POST | `/outlets` |
| Outlets | GET | `/outlets/{id}` |
| Outlets | PATCH | `/outlets/{id}` |
| Outlets | POST | `/outlets/{id}/wholesalers` |
| Outlets | DELETE | `/outlets/{id}/wholesalers/{linkId}` |
| Outlets | GET | `/outlets/duplicates` |
| Products & Competitors | POST | `/brands` |
| Products & Competitors | POST | `/competitor-products` |
| Products & Competitors | GET | `/competitors` |
| Products & Competitors | POST | `/competitors` |
| Products & Competitors | GET | `/lookups` |
| Products & Competitors | GET | `/product-variants` |
| Products & Competitors | POST | `/product-variants` |
| Products & Competitors | PATCH | `/product-variants/{id}` |
| Products & Competitors | GET | `/products` |
| Products & Competitors | POST | `/products` |
| Reports & Export | GET | `/reports` |
| Reports & Export | GET | `/reports/{type}` |
| Reports & Export | GET | `/reports/{type}/export` |
| Review Queue | GET | `/review-queue/{type}` |
| Review Queue | POST | `/review-queue/{type}/decision` |
| Review Queue | GET | `/review-queue/summary` |
| Roles | GET | `/roles` |
| Roles | POST | `/roles` |
| Roles | PUT | `/roles/{id}/permissions` |
| Roles | GET | `/roles/permissions` |
| SPG | GET | `/spgs` |
| SPG | POST | `/spgs` |
| SPG | GET | `/spgs/{id}` |
| SPG | PATCH | `/spgs/{id}` |
| SPG | POST | `/spgs/{id}/assignments` |
| SPG Grosir – Retailer Transactions | POST | `/retailer-transactions` |
| SPG Grosir – Retailer Transactions | GET | `/retailer-transactions` |
| SPG Grosir – Retailer Transactions | GET | `/retailer-transactions/{id}` |
| SPG Grosir – Retailer Transactions | POST | `/retailer-transactions/{id}/corrections` |
| SPG Grosir – Retailer Transactions | POST | `/retailer-transactions/{id}/decision` |
| SPG Grosir – Retailer Transactions | POST | `/retailer-transactions/{id}/reversal-requests` |
| SPG Grosir – Wholesale | POST | `/wholesale/observations` |
| SPG Grosir – Wholesale | POST | `/wholesale/reports` |
| SPG Grosir – Wholesale | GET | `/wholesale/retailers/{id}/history` |
| SPG Grosir – Wholesale | GET | `/wholesale/wholesalers/{id}/intelligence` |
| SPG HORECA | POST | `/horeca/program-implementations` |
| SPG HORECA | GET | `/horeca/programs` |
| SPG HORECA | POST | `/horeca/programs` |
| SPG HORECA | GET | `/horeca/programs/{id}/performance` |
| SPG HORECA | PATCH | `/horeca/programs/{id}/status` |
| SPG HORECA | POST | `/horeca/sales` |
| SPG HORECA | GET | `/horeca/sales` |
| SPG HORECA | POST | `/horeca/visit-details` |
| SPG HORECA | POST | `/posm-records` |
| SPG Reguler | POST | `/regular/availability` |
| SPG Reguler | GET | `/regular/availability` |
| SPG Reguler | POST | `/regular/orders` |
| SPG Reguler | GET | `/regular/orders` |
| SPG Reguler | POST | `/regular/visibility` |
| SPG Reguler | GET | `/regular/visibility` |
| System Settings | GET | `/settings` |
| System Settings | PUT | `/settings/{key}` |
| Users | GET | `/users` |
| Users | POST | `/users` |
| Users | GET | `/users/{id}` |
| Users | PATCH | `/users/{id}` |
| Users | POST | `/users/{id}/reset-password` |
| Visits | GET | `/visit-plans` |
| Visits | POST | `/visit-plans` |
| Visits | POST | `/visit-plans/{id}/cancel` |
| Visits | GET | `/visits` |
| Visits | GET | `/visits/{id}` |
| Visits | POST | `/visits/{id}/check-out` |
| Visits | POST | `/visits/{id}/evidence` |
| Visits | POST | `/visits/{id}/override` |
| Visits | POST | `/visits/check-in` |

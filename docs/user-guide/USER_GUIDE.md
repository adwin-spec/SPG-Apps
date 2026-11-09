# User guide

## 1. Signing in
Open the web address and sign in with your company e-mail. Management roles land on **Overview**; SPG accounts land
on the field app (**/m**). Five wrong passwords lock the account for 15 minutes. Sessions renew automatically; signing
out (or an admin deactivating your account) ends them immediately.

## 2. SPG field app (phone)
Install it: open the address in Chrome/Safari → *Add to Home screen*. It keeps working without signal.

| Step | What to do |
|---|---|
| **Today → Check in** | Allow location. Location is captured only at check-in/out and outlet visits – never in the background. |
| **Outlets → Visit → Check in at outlet** | Shows today's plan; any assigned outlet can be visited (unplanned visits are recorded as such). If you are far from the outlet the visit is flagged for your supervisor (it is not blocked unless configured). |
| **Record** (tabs depend on your category) | **Grosir:** retailer transaction (our product and competitor lines, actual/estimate/observation), competitor observation, grosir stock, visit report; register a new retailer (online – the app warns about similar names to avoid duplicates). **HORECA:** visit details (purpose, PIC, follow-up), sale/order, POSM, program execution, competitor. **Reguler:** availability per SKU (out-of-stock needs a reason), visibility (Share of Shelf is calculated for you), order, POSM, competitor. |
| **Photos** | Taken with the camera, stored on the phone and uploaded automatically. |
| **Check out of outlet** | Outcome, PIC met, order status, follow-up. |
| **Report** | One daily report per day with the form for your category. Reports after the deadline are marked late. |
| **Sync pill / Sync center** | *Offline · n* = saved on the phone; *Synced* = on the server. Entries are never duplicated. If something *needs action* (e.g. already checked in on another phone), choose Retry or Discard. |
| **My KPI** | Your score, rank and each KPI's actual vs target. Only approved data counts. |

## 3. Supervisors & managers (web)

| Task | Where |
|---|---|
| See today's exceptions (not checked in, missed visits, late reports, out-of-geofence, failed sync) | Overview → Operational |
| Approve / reject records (single or bulk) | Approvals → Review queue; Grosir → transaction detail |
| Correct a transaction | Transaction detail → *Submit correction* (original is kept and superseded only after approval) |
| Reverse an approved transaction | Transaction detail → *Request reversal* → a **second** person approves in Approvals → Requests |
| Review daily reports | Attendance & Visits → Daily reports (approve / request revision – the SPG is notified) |
| Override attendance / visit flags | Attendance (override) or Visit detail (override) – a reason is mandatory and audited |
| Plan visits | Attendance & Visits → Visit plans |
| Paper forms (OCR) | Integrations → OCR review: photo and OCR side by side, correct fields, submit; another authorised person approves → the transaction is created |

## 4. Analytics
* **Filters** (date, category, region, area, Kabupaten, Kecamatan, supervisor, SPG, brand) sit in one row above the charts and are kept in the URL – share the link to share the view.
* **Drill-down**: Overview → Drill-down: National → Region → Area → Kabupaten → Kecamatan → SPG → Outlet → Visit → Transaction.
* Every chart has a **table toggle** (icon top-right) for exact values.
* **Exports** (Excel/CSV/PDF) always use the filter on screen; the filter is written inside the file.
* Definitions: *registered* ≠ *visited* ≠ *active* ≠ *company-product buying* retailer (hover the ⓘ icons).

## 5. Administrators
* **KPI & Performance → KPI configuration**: add KPIs from the metric catalogue, version formulas, change weights (effective-dated, history kept). Weight totals per category are checked.
* **Targets**: per KPI and month; leave empty for *undefined* (not scored) – this is different from an explicit 0. Per-SPG overrides need a reason.
* **Ranking → Recalculate / Lock period**: locked months are never recalculated.
* **System Settings**: every rule is a *simulation default* until you confirm the production value.
* **User Management**, **Outlet Management** (organization tree, products, competitors), **Audit Trail** (before/after of every change), **Data Quality** (score, issues, resolve/ignore, run scan).

/**
 * Configurable business rules (ADR §1.1). Seeded into `system_settings` with
 * isSimulationDefault = true. Admins must confirm before go-live.
 */
export interface SettingDef { key: string; value: unknown; description: string }

export const DEFAULT_SETTINGS: SettingDef[] = [
  { key: 'kpi.finalStatuses', value: ['APPROVED'], description: 'Validation statuses counted in final KPI (A5)' },
  { key: 'kpi.finalVisitStatuses', value: ['VALIDATED', 'APPROVED'], description: 'Visit statuses counted in activity KPIs (visits are auto-validated by geofence)' },
  { key: 'kpi.missingDataPolicy', value: 'EXCLUDE_AND_RENORMALIZE', description: 'EXCLUDE_AND_RENORMALIZE | EXCLUDE_NO_RENORMALIZE (A6)' },
  { key: 'kpi.performanceBands', value: [{ status: 'GOOD', min: 90 }, { status: 'WATCH', min: 70 }, { status: 'CRITICAL', min: 0 }], description: 'Score bands (A4)' },
  { key: 'attendance.defaultGeofenceRadiusM', value: 150, description: 'Default geofence radius in metres (A7)' },
  { key: 'attendance.outsideGeofencePolicy', value: 'FLAG', description: 'FLAG | BLOCK (A8)' },
  { key: 'attendance.maxGpsAccuracyM', value: 200, description: 'GPS readings less accurate than this are treated as UNKNOWN' },
  { key: 'attendance.workStartLocalTime', value: '08:30', description: 'Check-in after this local time is late' },
  { key: 'reporting.dailyDeadlineLocalTime', value: '21:00', description: 'Daily report deadline, Asia/Jakarta (A9)' },
  { key: 'visits.requireAttendance', value: true, description: 'SPG must check in attendance before an outlet visit' },
  { key: 'visits.minEffectiveDurationMin', value: 5, description: 'Minimum duration of an effective visit (A10)' },
  { key: 'wholesale.activeRetailerWindowDays', value: 30, description: 'Window for “active retailer” (A11)' },
  { key: 'transactions.maxBackdateDays', value: 14, description: 'Transactions dated older than this are flagged NEEDS_REVIEW' },
  { key: 'transactions.priceDeviationPct', value: 50, description: 'Unit price deviating more than ±% from list price is flagged' },
  { key: 'outlets.potentialClasses', value: ['A', 'B', 'C', 'D'], description: 'Outlet potential classification list (A12)' },
  { key: 'retailers.duplicateSimilarityThreshold', value: 0.55, description: 'pg_trgm similarity threshold (A13)' },
  { key: 'sync.maxClientClockSkewMin', value: 120, description: 'Flag offline records whose device clock differs more than this' },
  { key: 'integrations.googleSheets.mapping', value: {
      FILE_LOG: { sheet: 'FILE_LOG', columns: { fileId: 'File ID', fileName: 'File Name', spgId: 'SPG ID', wholesalerId: 'Grosir ID', reportDate: 'Tanggal', status: 'Status' } },
      OCR_RAW: { sheet: 'OCR_RAW', columns: { fileId: 'File ID', rawText: 'Raw Text', confidence: 'Confidence' } },
      INPUT_HARIAN: { sheet: 'INPUT_HARIAN', columns: { formId: 'Form ID', spgId: 'SPG ID', wholesalerId: 'Grosir ID', retailerName: 'Nama Retailer', sku: 'SKU', brand: 'Brand', quantity: 'Qty', unit: 'Satuan', price: 'Harga', reportDate: 'Tanggal' } },
      TRANSACTION_DB: { sheet: 'TRANSACTION_DB', columns: { transactionNo: 'Transaction ID', retailerId: 'Retailer ID', wholesalerId: 'Grosir ID', spgId: 'SPG ID', date: 'Tanggal', sku: 'SKU', quantity: 'Qty', value: 'Total' } },
    }, description: 'Sheet & column mapping – rename here, not in code (A15)' },
  { key: 'notifications.rules', value: {
      MISSING_CHECKIN: { roles: ['SUPERVISOR', 'AREA_MANAGER'], severity: 'WARNING', enabled: true },
      MISSING_REPORT: { roles: ['SUPERVISOR'], severity: 'WARNING', enabled: true },
      LATE_REPORT: { roles: ['SUPERVISOR'], severity: 'INFO', enabled: true },
      REPORT_REVISION: { roles: ['SPG'], severity: 'WARNING', enabled: true },
      OCR_NEEDS_REVIEW: { roles: ['SUPERVISOR', 'ADMIN'], severity: 'INFO', enabled: true },
      DUPLICATE_SUBMISSION: { roles: ['SUPERVISOR', 'ADMIN'], severity: 'WARNING', enabled: true },
      SYNC_FAILED: { roles: ['ADMIN'], severity: 'CRITICAL', enabled: true },
      LOW_ACHIEVEMENT: { roles: ['SUPERVISOR', 'AREA_MANAGER'], severity: 'WARNING', enabled: true, thresholdPct: 70 },
      PERFORMANCE_DROP: { roles: ['SUPERVISOR', 'AREA_MANAGER'], severity: 'WARNING', enabled: true, dropPoints: 10 },
      APPROVAL_PENDING: { roles: ['SUPERVISOR'], severity: 'INFO', enabled: true },
    }, description: 'Notification routing by type, role and urgency' },
];

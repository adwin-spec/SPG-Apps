import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { pct, paginationQuery, type AnalyticsFilter, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { num } from '../common/sql';
import { Paginated, pageArgs } from '../common/http/paginated';
import { FilterService } from '../analytics/filter.service';

export const dqIssueQuery = paginationQuery.extend({ status: z.enum(['OPEN', 'RESOLVED', 'IGNORED']).optional(), severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  dimension: z.enum(['COMPLETENESS', 'VALIDITY', 'UNIQUENESS', 'CONSISTENCY', 'TIMELINESS']).optional(), ruleCode: z.string().max(60).optional() });

interface RuleDef { code: string; dimension: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; entityType: string; sql: Prisma.Sql }

/** Rule-based detectors; each returns (entity_id, spg_id, message). Issues are upserted, never duplicated. */
const RULES: RuleDef[] = [
  { code: 'OUTLET_MISSING_GPS', dimension: 'COMPLETENESS', severity: 'WARNING', entityType: 'Outlet',
    sql: Prisma.sql`SELECT id AS entity_id, assigned_spg_id AS spg_id, 'Outlet ' || code || ' has no GPS coordinates' AS message FROM outlets WHERE status <> 'CLOSED' AND (latitude IS NULL OR longitude IS NULL)` },
  { code: 'OUTLET_POSSIBLE_DUPLICATE', dimension: 'UNIQUENESS', severity: 'WARNING', entityType: 'Outlet',
    sql: Prisma.sql`SELECT b.id AS entity_id, b.assigned_spg_id AS spg_id, 'Name very similar to ' || a.code || ' (' || a.name || ') in the same Kabupaten' AS message
      FROM outlets a JOIN outlets b ON a.district_id = b.district_id AND a.channel = b.channel AND a.id < b.id AND a.normalized_name % b.normalized_name AND similarity(a.normalized_name, b.normalized_name) >= 0.8
      WHERE a.status <> 'CLOSED' AND b.status <> 'CLOSED'` },
  { code: 'TX_EXACT_DUPLICATE', dimension: 'UNIQUENESS', severity: 'CRITICAL', entityType: 'RetailerTransaction',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Transaction ' || transaction_no || ' is an exact duplicate awaiting review' AS message FROM retailer_transactions WHERE duplicate_type = 'EXACT_DUPLICATE' AND validation_status IN ('SUBMITTED','VALIDATED','NEEDS_REVIEW')` },
  { code: 'TX_MISSING_PRICE', dimension: 'COMPLETENESS', severity: 'WARNING', entityType: 'RetailerTransaction',
    sql: Prisma.sql`SELECT DISTINCT t.id AS entity_id, t.spg_id, 'Transaction ' || t.transaction_no || ' has line(s) without price' AS message FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id
      WHERE i.unit_price IS NULL AND t.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED')` },
  { code: 'TX_UNMAPPED_COMPETITOR_SKU', dimension: 'VALIDITY', severity: 'INFO', entityType: 'RetailerTransaction',
    sql: Prisma.sql`SELECT DISTINCT t.id AS entity_id, t.spg_id, 'Competitor product "' || COALESCE(i.brand_text, '') || ' ' || COALESCE(i.sku_text, '') || '" not in master data' AS message
      FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id WHERE i.product_owner = 'COMPETITOR' AND i.competitor_product_id IS NULL AND t.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED')` },
  { code: 'TX_UNLINKED_WHOLESALER', dimension: 'CONSISTENCY', severity: 'WARNING', entityType: 'RetailerTransaction',
    sql: Prisma.sql`SELECT t.id AS entity_id, t.spg_id, 'Retailer is not linked to the wholesaler on ' || t.transaction_no AS message FROM retailer_transactions t
      WHERE t.wholesaler_outlet_id IS NOT NULL AND t.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED')
        AND NOT EXISTS (SELECT 1 FROM retailer_wholesale_relationships r WHERE r.retailer_outlet_id = t.retailer_outlet_id AND r.wholesaler_outlet_id = t.wholesaler_outlet_id)` },
  { code: 'VISIT_OUTSIDE_GEOFENCE', dimension: 'VALIDITY', severity: 'WARNING', entityType: 'Visit',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Check-in ' || COALESCE(check_in_distance_m::text, '?') || ' m from outlet, awaiting review' AS message FROM visits WHERE geofence_status = 'OUTSIDE' AND validation_status = 'NEEDS_REVIEW'` },
  { code: 'VISIT_UNKNOWN_GPS', dimension: 'VALIDITY', severity: 'INFO', entityType: 'Visit',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Visit without a usable GPS reading' AS message FROM visits WHERE geofence_status = 'UNKNOWN' AND visit_date > current_date - 30` },
  { code: 'VISIT_NOT_CHECKED_OUT', dimension: 'CONSISTENCY', severity: 'WARNING', entityType: 'Visit',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Visit still open since ' || to_char(check_in_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS message FROM visits WHERE status = 'IN_PROGRESS' AND check_in_at < now() - interval '12 hours'` },
  { code: 'REPORT_LATE', dimension: 'TIMELINESS', severity: 'INFO', entityType: 'DailyReport',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Daily report for ' || report_date || ' submitted late' AS message FROM daily_reports WHERE is_late AND report_date > current_date - 30` },
  { code: 'REPORT_INCOMPLETE', dimension: 'COMPLETENESS', severity: 'INFO', entityType: 'DailyReport',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Daily report ' || report_date || ' is ' || completeness_score || '% complete' AS message FROM daily_reports WHERE completeness_score < 80 AND report_date > current_date - 30` },
  { code: 'SPG_WITHOUT_SUPERVISOR', dimension: 'CONSISTENCY', severity: 'WARNING', entityType: 'Spg',
    sql: Prisma.sql`SELECT id AS entity_id, id AS spg_id, 'Active SPG ' || employee_code || ' has no supervisor' AS message FROM spgs WHERE status = 'ACTIVE' AND current_supervisor_id IS NULL` },
  { code: 'SYNC_CLOCK_SKEW', dimension: 'TIMELINESS', severity: 'INFO', entityType: 'Visit',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'Offline record synced ' || round(extract(epoch FROM created_at - client_recorded_at) / 3600) || ' h after capture' AS message FROM visits
      WHERE client_recorded_at IS NOT NULL AND created_at - client_recorded_at > interval '24 hours' AND visit_date > current_date - 30` },
  { code: 'FILE_SYNC_FAILED', dimension: 'TIMELINESS', severity: 'CRITICAL', entityType: 'FileLog',
    sql: Prisma.sql`SELECT id AS entity_id, spg_id, 'OCR/integration failed: ' || COALESCE(last_error, 'unknown error') AS message FROM file_logs WHERE status = 'SYNC_FAILED'` },
];

@Injectable()
export class DataQualityService {
  private readonly log = new Logger(DataQualityService.name);
  constructor(private readonly prisma: PrismaService, private readonly filters: FilterService, private readonly audit: AuditService) {}

  /** Runs every rule; new findings are inserted, findings that disappeared are auto-resolved. */
  async scan() {
    const t0 = Date.now(); const out: Record<string, number> = {};
    for (const rule of RULES) {
      const rows = await this.prisma.$queryRaw<{ entity_id: string; spg_id: string | null; message: string }[]>(rule.sql);
      out[rule.code] = rows.length;
      const ids = rows.map((r) => r.entity_id);
      await this.prisma.$transaction(async (tx) => {
        if (rows.length) await tx.dataQualityIssue.createMany({ skipDuplicates: true, data: rows.map((r) => ({ ruleCode: rule.code, dimension: rule.dimension, entityType: rule.entityType, entityId: r.entity_id, spgId: r.spg_id, severity: rule.severity, message: r.message })) });
        await tx.dataQualityIssue.updateMany({ where: { ruleCode: rule.code, status: 'OPEN', ...(ids.length ? { entityId: { notIn: ids } } : {}) }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        // re-open previously resolved issues that re-appeared
        if (ids.length) await tx.dataQualityIssue.updateMany({ where: { ruleCode: rule.code, status: 'RESOLVED', resolvedById: null, entityId: { in: ids } }, data: { status: 'OPEN', resolvedAt: null } });
      });
    }
    this.log.log(`DQ scan finished in ${Date.now() - t0} ms`);
    return { findings: out, durationMs: Date.now() - t0 };
  }

  /** Data Quality Score = mean of Completeness, Validity, Uniqueness, Consistency, Timeliness (each 0–100). */
  async summary(user: AuthUser, f: AnalyticsFilter) {
    const r = await this.filters.resolve(user, f);
    const ids = Prisma.sql`${r.spgIds}::uuid[]`;
    const between = (c: string) => Prisma.sql`${Prisma.raw(c)} >= ${r.from}::date AND ${Prisma.raw(c)} < ${r.toExclusive}::date`;
    const [m] = num(await this.prisma.$queryRaw<Record<string, number>[]>`SELECT
      (SELECT avg(completeness_score) FROM daily_reports WHERE spg_id = ANY(${ids}) AND ${between('report_date')}) AS report_completeness,
      (SELECT 100.0 * count(*) FILTER (WHERE latitude IS NOT NULL) / NULLIF(count(*), 0) FROM outlets WHERE status <> 'CLOSED' AND assigned_spg_id = ANY(${ids})) AS outlet_gps_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM retailer_transaction_items i WHERE i.transaction_id = t.id AND i.unit_price IS NULL)) / NULLIF(count(*), 0)
         FROM retailer_transactions t WHERE t.spg_id = ANY(${ids}) AND ${between('t.transaction_date')}) AS tx_priced_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE validation_status IN ('VALIDATED','APPROVED')) / NULLIF(count(*) FILTER (WHERE validation_status IN ('VALIDATED','APPROVED','NEEDS_REVIEW','REJECTED')), 0)
         FROM retailer_transactions WHERE spg_id = ANY(${ids}) AND ${between('transaction_date')}) AS tx_valid_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE geofence_status = 'INSIDE') / NULLIF(count(*), 0) FROM visits WHERE spg_id = ANY(${ids}) AND ${between('visit_date')}) AS visit_inside_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE duplicate_type NOT IN ('EXACT_DUPLICATE','POTENTIAL_DUPLICATE')) / NULLIF(count(*), 0) FROM retailer_transactions WHERE spg_id = ANY(${ids}) AND ${between('transaction_date')}) AS tx_unique_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE wholesaler_outlet_id IS NULL OR EXISTS (SELECT 1 FROM retailer_wholesale_relationships rw WHERE rw.retailer_outlet_id = t.retailer_outlet_id AND rw.wholesaler_outlet_id = t.wholesaler_outlet_id)) / NULLIF(count(*), 0)
         FROM retailer_transactions t WHERE t.spg_id = ANY(${ids}) AND ${between('t.transaction_date')}) AS tx_consistent_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE status = 'COMPLETED') / NULLIF(count(*) FILTER (WHERE status <> 'CANCELLED'), 0) FROM visits WHERE spg_id = ANY(${ids}) AND ${between('visit_date')}) AS visit_closed_pct,
      (SELECT 100.0 * count(*) FILTER (WHERE NOT is_late) / NULLIF(count(*), 0) FROM daily_reports WHERE spg_id = ANY(${ids}) AND status <> 'DRAFT' AND ${between('report_date')}) AS report_on_time_pct`);
    const avg = (...xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + Number(b), 0) / v.length) * 100) / 100 : null; };
    const dims = {
      COMPLETENESS: avg(m.report_completeness, m.outlet_gps_pct, m.tx_priced_pct),
      VALIDITY: avg(m.tx_valid_pct, m.visit_inside_pct),
      UNIQUENESS: avg(m.tx_unique_pct),
      CONSISTENCY: avg(m.tx_consistent_pct, m.visit_closed_pct),
      TIMELINESS: avg(m.report_on_time_pct),
    };
    const issues = await this.prisma.dataQualityIssue.groupBy({ by: ['dimension', 'severity'], where: { status: 'OPEN', OR: [{ spgId: null }, { spgId: { in: r.spgIds } }] }, _count: true });
    const byRule = await this.prisma.dataQualityIssue.groupBy({ by: ['ruleCode', 'severity', 'dimension'], where: { status: 'OPEN', OR: [{ spgId: null }, { spgId: { in: r.spgIds } }] }, _count: true, orderBy: { _count: { ruleCode: 'desc' } } });
    const bySpg = num(await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT s.id, s.full_name, count(i.id) AS open_issues, count(i.id) FILTER (WHERE i.severity = 'CRITICAL') AS critical
      FROM spgs s LEFT JOIN data_quality_issues i ON i.spg_id = s.id AND i.status = 'OPEN' WHERE s.id = ANY(${ids}) GROUP BY s.id ORDER BY open_issues DESC LIMIT 20`);
    return { filter: { from: r.from, to: r.to }, score: avg(...Object.values(dims)), dimensions: dims, measures: m, issues, byRule, bySpg,
      layers: await this.layers(r.spgIds) };
  }

  /** RAW → VALIDATED → APPROVED funnel across business records. */
  private async layers(spgIds: string[]) {
    return num(await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT entity, validation_status AS status, count(*) AS n FROM (
      SELECT 'retailer_transactions' AS entity, validation_status::text FROM retailer_transactions WHERE spg_id = ANY(${spgIds}::uuid[])
      UNION ALL SELECT 'outlet_orders', validation_status::text FROM outlet_orders WHERE spg_id = ANY(${spgIds}::uuid[])
      UNION ALL SELECT 'horeca_sales', validation_status::text FROM horeca_sales WHERE spg_id = ANY(${spgIds}::uuid[])
      UNION ALL SELECT 'competitor_observations', validation_status::text FROM competitor_observations WHERE spg_id = ANY(${spgIds}::uuid[])) x GROUP BY 1, 2 ORDER BY 1, 2`);
  }

  async issues(user: AuthUser, q: z.infer<typeof dqIssueQuery>) {
    const r = await this.filters.resolve(user, {});
    const where: Prisma.DataQualityIssueWhereInput = { OR: [{ spgId: null }, { spgId: { in: r.spgIds } }], ...(q.status ? { status: q.status } : { status: 'OPEN' }),
      ...(q.severity ? { severity: q.severity } : {}), ...(q.dimension ? { dimension: q.dimension } : {}), ...(q.ruleCode ? { ruleCode: q.ruleCode } : {}),
      ...(q.q ? { message: { contains: q.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.dataQualityIssue.findMany({ where, orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }], ...pageArgs(q) }),
      this.prisma.dataQualityIssue.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async updateIssue(user: AuthUser, id: string, status: 'RESOLVED' | 'IGNORED' | 'OPEN', note?: string | null) {
    const before = await this.prisma.dataQualityIssue.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.dataQualityIssue.update({ where: { id }, data: { status, resolvedAt: status === 'OPEN' ? null : new Date(), resolvedById: status === 'OPEN' ? null : user.id } });
    await this.audit.log({ actorId: user.id, action: `DQ_${status}`, entityType: 'DataQualityIssue', entityId: id, before: { status: before.status }, after: { status }, reason: note });
    return after;
  }
}

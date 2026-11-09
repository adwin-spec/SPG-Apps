import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { jakartaDate, pct, periodMonth, type AnalyticsFilter, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { num } from '../common/sql';
import { FilterService, ResolvedFilter } from './filter.service';

type Row = Record<string, unknown>;
const ids = (r: ResolvedFilter) => Prisma.sql`${r.spgIds}::uuid[]`;
const fin = (col: string, r: ResolvedFilter) => Prisma.sql`${Prisma.raw(col)}::text = ANY(${r.final}::text[])`;
const between = (col: string, r: ResolvedFilter) => Prisma.sql`${Prisma.raw(col)} >= ${r.from}::date AND ${Prisma.raw(col)} < ${r.toExclusive}::date`;

/**
 * Unified "company sales" grain used by every commercial figure (final status, ACTUAL only, company products):
 *  GROSIR  = company lines of retailer transactions (retailer purchases from wholesalers)
 *  HORECA  = horeca_sales      REGULER = outlet_order_items (order not cancelled)
 */
export const salesCte = (r: ResolvedFilter) => Prisma.sql`
  sales AS (
    SELECT t.spg_id, t.retailer_outlet_id AS outlet_id, t.transaction_date AS d, i.product_variant_id AS variant_id, i.quantity AS qty, COALESCE(i.line_total, 0) AS value, 'GROSIR' AS category, t.id AS source_id
      FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id AND i.product_owner = 'COMPANY'
     WHERE t.spg_id = ANY(${ids(r)}) AND ${fin('t.validation_status', r)} AND t.data_nature = 'ACTUAL' AND ${between('t.transaction_date', r)} ${r.outletSql('t.retailer_outlet_id')} ${r.variantSql('i.product_variant_id')}
    UNION ALL
    SELECT s.spg_id, s.outlet_id, s.sale_date, s.product_variant_id, s.quantity, COALESCE(s.sales_value, 0), 'HORECA', s.id
      FROM horeca_sales s WHERE s.spg_id = ANY(${ids(r)}) AND ${fin('s.validation_status', r)} AND s.data_nature = 'ACTUAL' AND ${between('s.sale_date', r)} ${r.outletSql('s.outlet_id')} ${r.variantSql('s.product_variant_id')}
    UNION ALL
    SELECT o.spg_id, o.outlet_id, o.order_date, i.product_variant_id, i.quantity, i.line_total, 'REGULER', o.id
      FROM outlet_orders o JOIN outlet_order_items i ON i.order_id = o.id
     WHERE o.spg_id = ANY(${ids(r)}) AND ${fin('o.validation_status', r)} AND o.data_nature = 'ACTUAL' AND o.status <> 'CANCELLED' AND ${between('o.order_date', r)} ${r.outletSql('o.outlet_id')} ${r.variantSql('i.product_variant_id')}
  )`;

const visitsCte = (r: ResolvedFilter) => Prisma.sql`
  vis AS (SELECT v.* FROM visits v WHERE v.spg_id = ANY(${ids(r)}) AND v.status = 'COMPLETED' AND v.validation_status::text = ANY(${r.finalVisit}::text[]) AND ${between('v.visit_date', r)} ${r.outletSql('v.outlet_id')})`;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly filters: FilterService) {}

  private q<T = Row>(sql: Prisma.Sql) { return this.prisma.$queryRaw<T[]>(sql).then((rows) => num(rows as Row[]) as T[]); }

  async executive(user: AuthUser, f: AnalyticsFilter) {
    const r = await this.filters.resolve(user, f);
    const minEff = Number((await this.prisma.systemSetting.findUnique({ where: { key: 'visits.minEffectiveDurationMin' } }))?.value ?? 5);
    const period = periodMonth(r.to);
    const [spgCounts, visitStats, planStats, salesTotals, reportStats, scoreStats, trend, byCategory, geo, ranking, distribution, targetVsActual] = await Promise.all([
      this.q(Prisma.sql`SELECT c.code AS category, count(*) FILTER (WHERE s.status = 'ACTIVE') AS active, count(*) AS total FROM spgs s JOIN spg_categories c ON c.id = s.category_id WHERE s.id = ANY(${ids(r)}) GROUP BY c.code`),
      this.q(Prisma.sql`WITH ${visitsCte(r)} SELECT count(*) AS visits,
          count(*) FILTER (WHERE duration_min >= ${minEff} AND (EXISTS (SELECT 1 FROM retailer_transactions x WHERE x.visit_id = vis.id) OR EXISTS (SELECT 1 FROM outlet_orders x WHERE x.visit_id = vis.id)
            OR EXISTS (SELECT 1 FROM horeca_sales x WHERE x.visit_id = vis.id) OR EXISTS (SELECT 1 FROM availability_records x WHERE x.visit_id = vis.id)
            OR EXISTS (SELECT 1 FROM visibility_records x WHERE x.visit_id = vis.id) OR EXISTS (SELECT 1 FROM competitor_observations x WHERE x.visit_id = vis.id)
            OR EXISTS (SELECT 1 FROM wholesale_observations x WHERE x.visit_id = vis.id) OR EXISTS (SELECT 1 FROM posm_records x WHERE x.visit_id = vis.id))) AS effective_visits,
          count(*) FILTER (WHERE geofence_status = 'OUTSIDE') AS outside_geofence, count(DISTINCT outlet_id) AS outlets_visited FROM vis`),
      this.q(Prisma.sql`SELECT count(*) FILTER (WHERE status = 'VISITED') AS visited, count(*) AS planned FROM visit_plans p
          WHERE p.spg_id = ANY(${ids(r)}) AND p.status <> 'CANCELLED' AND p.planned_date >= ${r.from}::date AND p.planned_date < LEAST(${r.toExclusive}::date, ${jakartaDate()}::date) ${r.outletSql('p.outlet_id')}`),
      this.q(Prisma.sql`WITH ${salesCte(r)} SELECT category, sum(qty) AS volume, sum(value) AS value, count(DISTINCT outlet_id) AS productive_outlets, count(DISTINCT source_id) AS documents FROM sales GROUP BY ROLLUP(category)`),
      this.q(Prisma.sql`SELECT count(r.id) FILTER (WHERE r.status IN ('SUBMITTED','APPROVED') AND NOT r.is_late) AS on_time, count(r.id) FILTER (WHERE r.is_late) AS late, count(*) AS attended_days
          FROM attendance a LEFT JOIN daily_reports r ON r.spg_id = a.spg_id AND r.report_date = a.work_date
          WHERE a.spg_id = ANY(${ids(r)}) AND a.status IN ('CHECKED_IN','CHECKED_OUT') AND ${between('a.work_date', r)}`),
      this.q(Prisma.sql`SELECT avg(ps.total_score) AS avg_score, avg(ps.weight_coverage) AS avg_coverage, count(ps.total_score) AS scored,
          (SELECT avg(pr.scored_pct) FROM performance_results pr JOIN kpi_definitions k ON k.id = pr.kpi_definition_id
            WHERE pr.period_month = ${period}::date AND pr.spg_id = ANY(${ids(r)}) AND k.dimension = 'COMMERCIAL' AND pr.data_status = 'OK') AS commercial_achievement
          FROM performance_snapshots ps WHERE ps.period_month = ${period}::date AND ps.spg_id = ANY(${ids(r)})`),
      this.q(Prisma.sql`WITH ${salesCte(r)}, ${visitsCte(r)}, days AS (SELECT generate_series(${r.from}::date, ${r.to}::date, interval '1 day')::date AS d)
          SELECT to_char(days.d, 'YYYY-MM-DD') AS date, (SELECT count(*) FROM vis WHERE vis.visit_date = days.d) AS visits,
            (SELECT COALESCE(sum(value), 0) FROM sales WHERE sales.d = days.d) AS sales_value FROM days ORDER BY days.d`),
      this.q(Prisma.sql`WITH ${salesCte(r)} SELECT to_char(date_trunc('week', d), 'YYYY-MM-DD') AS week, category, sum(value) AS value, sum(qty) AS volume FROM sales GROUP BY 1, 2 ORDER BY 1`),
      this.q(Prisma.sql`WITH ${salesCte(r)}, ${visitsCte(r)}
          SELECT a.id AS area_id, a.name AS area, rg.name AS region, avg(o.latitude)::float AS lat, avg(o.longitude)::float AS lng,
            (SELECT count(*) FROM vis JOIN outlets vo ON vo.id = vis.outlet_id JOIN districts vd ON vd.id = vo.district_id WHERE vd.area_id = a.id) AS visits,
            (SELECT COALESCE(sum(value), 0) FROM sales JOIN outlets so ON so.id = sales.outlet_id JOIN districts sd ON sd.id = so.district_id WHERE sd.area_id = a.id) AS sales_value,
            (SELECT avg(ps.total_score) FROM performance_snapshots ps JOIN spgs sp ON sp.id = ps.spg_id WHERE sp.current_area_id = a.id AND ps.period_month = ${period}::date AND ps.spg_id = ANY(${ids(r)})) AS avg_score
          FROM areas a JOIN regions rg ON rg.id = a.region_id JOIN districts d ON d.area_id = a.id JOIN outlets o ON o.district_id = d.id
          WHERE a.id IN (SELECT current_area_id FROM spgs WHERE id = ANY(${ids(r)})) GROUP BY a.id, a.name, rg.name`),
      this.q(Prisma.sql`SELECT s.id AS spg_id, s.full_name, c.code AS category, ps.total_score, ps.rank_in_category, ps.performance_status FROM performance_snapshots ps
          JOIN spgs s ON s.id = ps.spg_id JOIN spg_categories c ON c.id = s.category_id
          WHERE ps.period_month = ${period}::date AND ps.spg_id = ANY(${ids(r)}) AND ps.total_score IS NOT NULL ORDER BY ps.total_score DESC`),
      this.q(Prisma.sql`SELECT width_bucket(ps.total_score, 0, 100, 10) AS bucket, count(*) AS spgs FROM performance_snapshots ps
          WHERE ps.period_month = ${period}::date AND ps.spg_id = ANY(${ids(r)}) AND ps.total_score IS NOT NULL GROUP BY 1 ORDER BY 1`),
      this.q(Prisma.sql`SELECT c.code AS category, k.code, k.name, k.unit, sum(pr.actual_value) AS actual, sum(pr.target_value) FILTER (WHERE pr.target_value IS NOT NULL) AS target,
            count(*) FILTER (WHERE pr.data_status = 'NO_TARGET') AS without_target
          FROM performance_results pr JOIN kpi_definitions k ON k.id = pr.kpi_definition_id JOIN spg_categories c ON c.id = k.category_id
          WHERE pr.period_month = ${period}::date AND pr.spg_id = ANY(${ids(r)}) AND k.dimension = 'COMMERCIAL' AND k.unit IN ('IDR', 'qty')
          GROUP BY c.code, k.code, k.name, k.unit, k.display_order ORDER BY c.code, k.display_order`),
    ]);
    const v = visitStats[0] ?? {}; const p = planStats[0] ?? {}; const rep = reportStats[0] ?? {}; const sc = scoreStats[0] ?? {};
    const total = salesTotals.find((s) => s.category == null) ?? {};
    return {
      filter: { ...r.raw, from: r.from, to: r.to, performancePeriod: period.slice(0, 7) },
      cards: {
        activeSpg: spgCounts.reduce((a, c) => a + Number(c.active), 0),
        activeSpgByCategory: Object.fromEntries(spgCounts.map((c) => [c.category as string, Number(c.active)])),
        visits: Number(v.visits ?? 0), effectiveVisits: Number(v.effective_visits ?? 0), outsideGeofenceVisits: Number(v.outside_geofence ?? 0),
        visitCompliancePct: pct(Number(p.visited ?? 0), Number(p.planned ?? 0)), plannedVisits: Number(p.planned ?? 0),
        productiveOutlets: Number(total.productive_outlets ?? 0), outletsVisited: Number(v.outlets_visited ?? 0),
        salesVolume: Number(total.volume ?? 0), salesValue: Number(total.value ?? 0),
        salesByCategory: salesTotals.filter((s) => s.category != null),
        avgPerformanceScore: sc.avg_score == null ? null : Math.round(Number(sc.avg_score) * 100) / 100, scoredSpgs: Number(sc.scored ?? 0),
        targetAchievementPct: sc.commercial_achievement == null ? null : Math.round(Number(sc.commercial_achievement) * 100) / 100,
        reportingCompliancePct: pct(Number(rep.on_time ?? 0), Number(rep.attended_days ?? 0)), lateReports: Number(rep.late ?? 0),
      },
      trend, salesByWeek: byCategory, geography: geo, ranking: { top: ranking.slice(0, 10), bottom: ranking.slice(-10).reverse() },
      distribution, targetVsActual,
      definitions: { sales: 'Final-status (APPROVED by default) ACTUAL company-product records only', visits: 'Completed visits with final validation status', effectiveVisit: `≥ ${minEff} min and ≥ 1 business record` },
    };
  }

  /** Drill-down: national → region → area → district → subdistrict → spg → outlet. Each row is traceable to the next level. */
  async drilldown(user: AuthUser, f: AnalyticsFilter & { level: string }) {
    const r = await this.filters.resolve(user, f);
    const dims: Record<string, { key: Prisma.Sql; label: Prisma.Sql; join: Prisma.Sql; next: string | null }> = {
      region: { key: Prisma.sql`rg.id`, label: Prisma.sql`rg.name`, join: Prisma.sql`JOIN districts d ON d.id = o.district_id JOIN areas a ON a.id = d.area_id JOIN regions rg ON rg.id = a.region_id`, next: 'area' },
      area: { key: Prisma.sql`a.id`, label: Prisma.sql`a.name`, join: Prisma.sql`JOIN districts d ON d.id = o.district_id JOIN areas a ON a.id = d.area_id`, next: 'district' },
      district: { key: Prisma.sql`d.id`, label: Prisma.sql`d.name`, join: Prisma.sql`JOIN districts d ON d.id = o.district_id`, next: 'subdistrict' },
      subdistrict: { key: Prisma.sql`COALESCE(sd.id, '00000000-0000-0000-0000-000000000000'::uuid)`, label: Prisma.sql`COALESCE(sd.name, '(no kecamatan)')`, join: Prisma.sql`LEFT JOIN subdistricts sd ON sd.id = o.subdistrict_id`, next: 'spg' },
      spg: { key: Prisma.sql`sp.id`, label: Prisma.sql`sp.full_name`, join: Prisma.sql`JOIN spgs sp ON sp.id = x.spg_id`, next: 'outlet' },
      outlet: { key: Prisma.sql`o.id`, label: Prisma.sql`o.name`, join: Prisma.empty, next: 'visit' },
    };
    const dim = dims[f.level];
    if (!dim) throw new BadRequestException({ code: 'INVALID_LEVEL', message: `level must be one of ${Object.keys(dims).join(', ')}` });
    const rows = await this.q(Prisma.sql`WITH ${salesCte(r)}, ${visitsCte(r)},
      x AS (SELECT spg_id, outlet_id, 1 AS visits, 0::numeric AS value, 0::numeric AS qty FROM vis UNION ALL SELECT spg_id, outlet_id, 0, value, qty FROM sales)
      SELECT ${dim.key} AS id, ${dim.label} AS name, sum(x.visits) AS visits, sum(x.value) AS sales_value, sum(x.qty) AS sales_volume,
             count(DISTINCT x.outlet_id) AS outlets, count(DISTINCT x.spg_id) AS spgs
      FROM x JOIN outlets o ON o.id = x.outlet_id ${dim.join}
      GROUP BY 1, 2 ORDER BY sales_value DESC, visits DESC LIMIT 500`);
    return { level: f.level, nextLevel: dim.next, filter: { ...r.raw, from: r.from, to: r.to }, rows };
  }

  async market(user: AuthUser, f: AnalyticsFilter) {
    const r = await this.filters.resolve(user, f);
    const obsWhere = Prisma.sql`co.spg_id = ANY(${ids(r)}) AND co.validation_status NOT IN ('REJECTED') AND ${between('co.observation_date', r)} ${r.outletSql('co.outlet_id')} ${r.brandSql('co.brand_id')}`;
    const txWhere = Prisma.sql`t.spg_id = ANY(${ids(r)}) AND ${fin('t.validation_status', r)} AND t.data_nature = 'ACTUAL' AND ${between('t.transaction_date', r)} ${r.outletSql('t.retailer_outlet_id')}`;
    const [companyVsCompetitor, brandDistribution, skuDistribution, pricing, stock, purchasing, wholesaleCoverage, horecaPenetration, availabilityBySku, shareOfShelf, promotions, priceTrend] = await Promise.all([
      this.q(Prisma.sql`SELECT i.product_owner AS owner, sum(i.quantity) AS qty, sum(i.line_total) AS value, count(DISTINCT t.retailer_outlet_id) AS retailers
          FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id WHERE ${txWhere} GROUP BY 1`),
      this.q(Prisma.sql`SELECT COALESCE(b.name, co.brand_text, 'Unmapped') AS brand, count(*) AS observations, count(DISTINCT co.outlet_id) AS outlets, sum(co.quantity_purchased) AS qty_purchased,
          sum(co.facing) AS facing FROM competitor_observations co LEFT JOIN brands b ON b.id = co.brand_id WHERE ${obsWhere} GROUP BY 1 ORDER BY observations DESC`),
      this.q(Prisma.sql`WITH ${salesCte(r)} SELECT pv.sku, pv.name, sum(qty) AS qty, sum(value) AS value, count(DISTINCT outlet_id) AS outlets FROM sales JOIN product_variants pv ON pv.id = sales.variant_id GROUP BY 1, 2 ORDER BY value DESC`),
      this.q(Prisma.sql`SELECT COALESCE(b.name, co.brand_text, 'Unmapped') AS brand, COALESCE(cp.name || COALESCE(' ' || cp.variant, ''), co.sku_text, '-') AS product,
          avg(co.purchase_price) AS avg_purchase_price, min(co.purchase_price) AS min_purchase_price, max(co.purchase_price) AS max_purchase_price, avg(co.selling_price) AS avg_selling_price, count(*) AS n
          FROM competitor_observations co LEFT JOIN brands b ON b.id = co.brand_id LEFT JOIN competitor_products cp ON cp.id = co.competitor_product_id
          WHERE ${obsWhere} AND (co.purchase_price IS NOT NULL OR co.selling_price IS NOT NULL) GROUP BY 1, 2 ORDER BY 1, 2`),
      this.q(Prisma.sql`SELECT COALESCE(b.name, co.brand_text, 'Unmapped') AS brand, co.stock_availability AS availability, count(*) AS n FROM competitor_observations co LEFT JOIN brands b ON b.id = co.brand_id WHERE ${obsWhere} GROUP BY 1, 2`),
      this.q(Prisma.sql`SELECT segment, count(*) AS retailers FROM (SELECT t.retailer_outlet_id,
            CASE WHEN bool_or(i.product_owner = 'COMPANY') AND bool_or(i.product_owner = 'COMPETITOR') THEN 'BOTH' WHEN bool_or(i.product_owner = 'COMPANY') THEN 'COMPANY_ONLY' ELSE 'COMPETITOR_ONLY' END AS segment
          FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id WHERE ${txWhere} GROUP BY 1) x GROUP BY 1`),
      this.q(Prisma.sql`WITH ws AS (SELECT o.id FROM outlets o WHERE o.channel = 'WHOLESALER' AND o.status = 'ACTIVE' AND o.assigned_spg_id = ANY(${ids(r)}) ${r.outletSql('o.id')})
          SELECT (SELECT count(*) FROM ws) AS wholesalers, (SELECT count(DISTINCT v.outlet_id) FROM visits v WHERE v.outlet_id IN (SELECT id FROM ws) AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS wholesalers_visited,
                 (SELECT count(DISTINCT rw.retailer_outlet_id) FROM retailer_wholesale_relationships rw WHERE rw.wholesaler_outlet_id IN (SELECT id FROM ws) AND rw.effective_to IS NULL) AS linked_retailers,
                 (SELECT count(DISTINCT t.retailer_outlet_id) FROM retailer_transactions t WHERE t.wholesaler_outlet_id IN (SELECT id FROM ws) AND ${fin('t.validation_status', r)} AND ${between('t.transaction_date', r)}) AS transacting_retailers`),
      this.q(Prisma.sql`SELECT count(DISTINCT o.id) AS assigned_outlets, count(DISTINCT s.outlet_id) AS buying_outlets, count(DISTINCT (s.outlet_id, s.product_variant_id)) AS outlet_sku_pairs
          FROM outlets o LEFT JOIN horeca_sales s ON s.outlet_id = o.id AND ${fin('s.validation_status', r)} AND ${between('s.sale_date', r)}
          WHERE o.channel = 'HORECA' AND o.status = 'ACTIVE' AND o.assigned_spg_id = ANY(${ids(r)}) ${r.outletSql('o.id')}`),
      this.q(Prisma.sql`SELECT pv.sku, pv.name, count(*) FILTER (WHERE a.is_available) AS available, count(*) AS checks, count(*) FILTER (WHERE NOT a.is_available) AS oos,
          mode() WITHIN GROUP (ORDER BY a.oos_reason) FILTER (WHERE NOT a.is_available) AS top_oos_reason
          FROM availability_records a JOIN product_variants pv ON pv.id = a.product_variant_id
          WHERE a.spg_id = ANY(${ids(r)}) AND ${fin('a.validation_status', r)} AND ${between('a.record_date', r)} ${r.outletSql('a.outlet_id')} ${r.variantSql('a.product_variant_id')} GROUP BY 1, 2 ORDER BY 1`),
      this.q(Prisma.sql`SELECT to_char(date_trunc('week', v.record_date), 'YYYY-MM-DD') AS week, sum(v.company_facing) AS company_facing, sum(v.competitor_facing) AS competitor_facing, sum(v.total_category_facing) AS total_facing,
          round(100.0 * sum(v.company_facing) / NULLIF(sum(v.total_category_facing), 0), 2) AS share_of_shelf_pct
          FROM visibility_records v WHERE v.spg_id = ANY(${ids(r)}) AND ${fin('v.validation_status', r)} AND ${between('v.record_date', r)} ${r.outletSql('v.outlet_id')} GROUP BY 1 ORDER BY 1`),
      this.q(Prisma.sql`SELECT COALESCE(b.name, co.brand_text, 'Unmapped') AS brand, count(*) FILTER (WHERE co.has_promotion) AS promotions, count(*) FILTER (WHERE co.has_posm) AS with_posm, count(*) AS observations,
          array_remove(array_agg(DISTINCT co.promotion_detail) FILTER (WHERE co.promotion_detail IS NOT NULL), NULL) AS examples
          FROM competitor_observations co LEFT JOIN brands b ON b.id = co.brand_id WHERE ${obsWhere} GROUP BY 1 ORDER BY promotions DESC`),
      this.q(Prisma.sql`SELECT to_char(date_trunc('week', co.observation_date), 'YYYY-MM-DD') AS week, COALESCE(b.name, co.brand_text, 'Unmapped') AS brand, avg(co.purchase_price) AS avg_price
          FROM competitor_observations co LEFT JOIN brands b ON b.id = co.brand_id WHERE ${obsWhere} AND co.purchase_price IS NOT NULL GROUP BY 1, 2 ORDER BY 1`),
    ]);
    const hp = horecaPenetration[0] ?? {};
    return { filter: { ...r.raw, from: r.from, to: r.to }, companyVsCompetitor, brandDistribution, skuDistribution, pricing, priceTrend, stock, purchasing,
      wholesaleCoverage: wholesaleCoverage[0] ?? {}, horecaPenetration: { ...hp, penetrationPct: pct(Number(hp.buying_outlets ?? 0), Number(hp.assigned_outlets ?? 0)) },
      availabilityBySku: availabilityBySku.map((a) => ({ ...a, availabilityPct: pct(Number(a.available), Number(a.checks)) })), shareOfShelf, promotions };
  }

  /** Exceptions that need action today (brief §J.4). */
  async operational(user: AuthUser, f: AnalyticsFilter & { date?: string }) {
    const r = await this.filters.resolve(user, f);
    const date = f.date ?? jakartaDate();
    const yesterday = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
    const [notCheckedIn, missedVisits, missingReports, lateReports, incompleteReports, pendingReview, pendingApprovals, ocr, duplicates, failedSync, outsideGeofence, overrides] = await Promise.all([
      this.q(Prisma.sql`SELECT s.id, s.full_name, s.employee_code, c.code AS category, u.full_name AS supervisor FROM spgs s JOIN spg_categories c ON c.id = s.category_id
          LEFT JOIN supervisors sv ON sv.id = s.current_supervisor_id LEFT JOIN users u ON u.id = sv.user_id
          WHERE s.id = ANY(${ids(r)}) AND s.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.spg_id = s.id AND a.work_date = ${date}::date) ORDER BY s.full_name`),
      this.q(Prisma.sql`SELECT p.id, p.planned_date, s.full_name AS spg, o.name AS outlet, p.status FROM visit_plans p JOIN spgs s ON s.id = p.spg_id JOIN outlets o ON o.id = p.outlet_id
          WHERE p.spg_id = ANY(${ids(r)}) AND ((p.status = 'MISSED' AND ${between('p.planned_date', r)}) OR (p.status = 'PLANNED' AND p.planned_date < ${date}::date)) ORDER BY p.planned_date DESC LIMIT 200`),
      this.q(Prisma.sql`SELECT s.id, s.full_name, a.work_date FROM attendance a JOIN spgs s ON s.id = a.spg_id
          WHERE a.spg_id = ANY(${ids(r)}) AND a.work_date = ${yesterday}::date AND NOT EXISTS (SELECT 1 FROM daily_reports d WHERE d.spg_id = a.spg_id AND d.report_date = a.work_date AND d.status <> 'DRAFT')`),
      this.q(Prisma.sql`SELECT d.id, s.full_name, d.report_date, d.submitted_at FROM daily_reports d JOIN spgs s ON s.id = d.spg_id WHERE d.spg_id = ANY(${ids(r)}) AND d.is_late AND ${between('d.report_date', r)} ORDER BY d.report_date DESC LIMIT 200`),
      this.q(Prisma.sql`SELECT d.id, s.full_name, d.report_date, d.completeness_score FROM daily_reports d JOIN spgs s ON s.id = d.spg_id WHERE d.spg_id = ANY(${ids(r)}) AND d.completeness_score < 100 AND ${between('d.report_date', r)} ORDER BY d.completeness_score LIMIT 200`),
      this.q(Prisma.sql`SELECT 'retailer_transactions' AS type, count(*) AS n FROM retailer_transactions WHERE spg_id = ANY(${ids(r)}) AND validation_status IN ('SUBMITTED','VALIDATED','NEEDS_REVIEW')
          UNION ALL SELECT 'outlet_orders', count(*) FROM outlet_orders WHERE spg_id = ANY(${ids(r)}) AND validation_status IN ('SUBMITTED','VALIDATED','NEEDS_REVIEW')
          UNION ALL SELECT 'horeca_sales', count(*) FROM horeca_sales WHERE spg_id = ANY(${ids(r)}) AND validation_status IN ('SUBMITTED','VALIDATED','NEEDS_REVIEW')
          UNION ALL SELECT 'daily_reports', count(*) FROM daily_reports WHERE spg_id = ANY(${ids(r)}) AND status = 'SUBMITTED'
          UNION ALL SELECT 'visits_needs_review', count(*) FROM visits WHERE spg_id = ANY(${ids(r)}) AND validation_status = 'NEEDS_REVIEW'`),
      this.prisma.approval.count({ where: { status: 'PENDING' } }),
      this.q(Prisma.sql`SELECT status, count(*) AS n FROM file_logs WHERE (spg_id IS NULL OR spg_id = ANY(${ids(r)})) GROUP BY status`),
      this.q(Prisma.sql`SELECT 'file' AS kind, duplicate_type::text AS type, count(*) AS n FROM file_logs WHERE duplicate_type <> 'NONE' AND (spg_id IS NULL OR spg_id = ANY(${ids(r)})) GROUP BY 2
          UNION ALL SELECT 'transaction', duplicate_type::text, count(*) FROM retailer_transactions WHERE duplicate_type IN ('EXACT_DUPLICATE','POTENTIAL_DUPLICATE') AND validation_status IN ('SUBMITTED','VALIDATED','NEEDS_REVIEW') AND spg_id = ANY(${ids(r)}) GROUP BY 2`),
      this.q(Prisma.sql`SELECT 'file_log' AS kind, count(*) AS n FROM file_logs WHERE status = 'SYNC_FAILED' UNION ALL SELECT 'sync_job', count(*) FROM sync_jobs WHERE status = 'FAILED' AND created_at > now() - interval '7 days'`),
      this.q(Prisma.sql`SELECT v.id, s.full_name AS spg, o.name AS outlet, v.check_in_at, v.check_in_distance_m FROM visits v JOIN spgs s ON s.id = v.spg_id JOIN outlets o ON o.id = v.outlet_id
          WHERE v.spg_id = ANY(${ids(r)}) AND v.geofence_status = 'OUTSIDE' AND v.validation_status = 'NEEDS_REVIEW' ORDER BY v.check_in_at DESC LIMIT 100`),
      this.q(Prisma.sql`SELECT entity_type, count(*) AS n FROM audit_logs WHERE action = 'OVERRIDE' AND created_at >= ${r.from}::date GROUP BY 1`),
    ]);
    return { date, filter: { ...r.raw, from: r.from, to: r.to }, notCheckedIn, missedVisits, missingReportsYesterday: missingReports, lateReports, incompleteReports,
      pendingReview, pendingApprovals, ocrStatus: ocr, duplicates, failedSync, outsideGeofence, overrides };
  }
}

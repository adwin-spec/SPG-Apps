import { Prisma } from '@tanda/database';

/**
 * Server-side KPI metric catalogue (ADR D6). Each metric is ONE parameterised SQL statement that
 * returns (spg_id, num, den) for every SPG in scope – bulk, set-based, no N+1.
 *  kind = 'ratio' ⇒ value = num/den×100 (den = 0 ⇒ NULL)   'count' ⇒ value = num   'avg' ⇒ num/den
 * Business records count only when validation_status ∈ kpi.finalStatuses (default APPROVED) and are never
 * SUPERSEDED / REVERSED / REJECTED. Commercial metrics use data_nature = 'ACTUAL' only.
 */
export interface MetricCtx {
  spgIds: string[];
  start: string;          // inclusive YYYY-MM-DD
  endExclusive: string;   // exclusive YYYY-MM-DD
  asOf: string;           // min(endExclusive, today) – future plans are not counted as missed
  final: string[];        // final statuses for business records
  finalVisit: string[];   // final statuses for visits
  minEffectiveMin: number;
  activeWindowDays: number;
  params: Record<string, unknown>;
}
export interface MetricRow { spg_id: string; num: number | null; den: number | null; n?: number }
export interface MetricDef { kind: 'ratio' | 'count' | 'avg'; sql: (c: MetricCtx) => Prisma.Sql; source: string }

const ids = (c: MetricCtx) => Prisma.sql`${c.spgIds}::uuid[]`;
const inPeriod = (col: string, c: MetricCtx) => Prisma.sql`${Prisma.raw(col)} >= ${c.start}::date AND ${Prisma.raw(col)} < ${c.endExclusive}::date`;
const fin = (col: string, c: MetricCtx) => Prisma.sql`${Prisma.raw(col)}::text = ANY(${c.final}::text[])`;
const finVisit = (c: MetricCtx) => Prisma.sql`v.validation_status::text = ANY(${c.finalVisit}::text[])`;

const completedVisits = (c: MetricCtx, channel?: string) => Prisma.sql`
  SELECT v.* FROM visits v WHERE v.spg_id = ANY(${ids(c)}) AND v.status = 'COMPLETED' AND ${finVisit(c)} AND ${inPeriod('v.visit_date', c)}
  ${channel ? Prisma.sql`AND v.channel = ${channel}::"OutletChannel"` : Prisma.empty}`;

const posmCompliance = (channel: string): MetricDef => ({
  kind: 'ratio', source: 'posm_records',
  sql: (c) => Prisma.sql`SELECT p.spg_id, count(*) FILTER (WHERE p.status = 'INSTALLED') AS num, count(*) FILTER (WHERE p.status <> 'NOT_APPLICABLE') AS den
    FROM posm_records p WHERE p.spg_id = ANY(${ids(c)}) AND p.channel = ${channel}::"OutletChannel" AND ${fin('p.validation_status', c)} AND ${inPeriod('p.record_date', c)} GROUP BY p.spg_id`,
});

export const METRICS: Record<string, MetricDef> = {
  'visits.completed_count': { kind: 'count', source: 'visits',
    sql: (c) => Prisma.sql`SELECT spg_id, count(*) AS num, NULL::numeric AS den FROM (${completedVisits(c)}) v GROUP BY spg_id` },

  'visits.effective_count': { kind: 'count', source: 'visits + business records',
    sql: (c) => Prisma.sql`SELECT v.spg_id, count(*) AS num, NULL::numeric AS den FROM (${completedVisits(c)}) v
      WHERE v.duration_min >= ${c.minEffectiveMin} AND (
        EXISTS (SELECT 1 FROM retailer_transactions x WHERE x.visit_id = v.id AND x.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED'))
        OR EXISTS (SELECT 1 FROM outlet_orders x WHERE x.visit_id = v.id AND x.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED'))
        OR EXISTS (SELECT 1 FROM horeca_sales x WHERE x.visit_id = v.id AND x.validation_status NOT IN ('REJECTED','SUPERSEDED','REVERSED'))
        OR EXISTS (SELECT 1 FROM availability_records x WHERE x.visit_id = v.id AND x.validation_status <> 'REJECTED')
        OR EXISTS (SELECT 1 FROM visibility_records x WHERE x.visit_id = v.id AND x.validation_status <> 'REJECTED')
        OR EXISTS (SELECT 1 FROM competitor_observations x WHERE x.visit_id = v.id AND x.validation_status <> 'REJECTED')
        OR EXISTS (SELECT 1 FROM wholesale_observations x WHERE x.visit_id = v.id)
        OR EXISTS (SELECT 1 FROM posm_records x WHERE x.visit_id = v.id AND x.validation_status <> 'REJECTED')
        OR EXISTS (SELECT 1 FROM horeca_program_implementations x WHERE x.visit_id = v.id AND x.validation_status <> 'REJECTED'))
      GROUP BY v.spg_id` },

  'visits.plan_compliance_pct': { kind: 'ratio', source: 'visit_plans',
    sql: (c) => Prisma.sql`SELECT p.spg_id, count(*) FILTER (WHERE p.status = 'VISITED') AS num, count(*) AS den
      FROM visit_plans p WHERE p.spg_id = ANY(${ids(c)}) AND p.status <> 'CANCELLED' AND p.planned_date >= ${c.start}::date AND p.planned_date < ${c.asOf}::date
      GROUP BY p.spg_id` },

  'outlets.coverage_pct': { kind: 'ratio', source: 'outlets (current assignment) + visits',
    sql: (c) => Prisma.sql`SELECT o.assigned_spg_id AS spg_id, count(DISTINCT v.outlet_id) AS num, count(DISTINCT o.id) AS den
      FROM outlets o LEFT JOIN (${completedVisits(c)}) v ON v.outlet_id = o.id AND v.spg_id = o.assigned_spg_id
      WHERE o.assigned_spg_id = ANY(${ids(c)}) AND o.status = 'ACTIVE' GROUP BY o.assigned_spg_id` },

  'reports.compliance_pct': { kind: 'ratio', source: 'attendance + daily_reports',
    sql: (c) => Prisma.sql`SELECT a.spg_id, count(r.id) FILTER (WHERE r.status IN ('SUBMITTED','APPROVED') AND NOT r.is_late) AS num, count(*) AS den
      FROM attendance a LEFT JOIN daily_reports r ON r.spg_id = a.spg_id AND r.report_date = a.work_date
      WHERE a.spg_id = ANY(${ids(c)}) AND a.status IN ('CHECKED_IN','CHECKED_OUT') AND ${inPeriod('a.work_date', c)} GROUP BY a.spg_id` },

  'data.validation_pass_pct': { kind: 'ratio', source: 'all business records',
    sql: (c) => Prisma.sql`SELECT spg_id, count(*) FILTER (WHERE st IN ('VALIDATED','APPROVED')) AS num, count(*) AS den FROM (
        SELECT spg_id, validation_status::text st FROM retailer_transactions WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('transaction_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM horeca_sales WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('sale_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM outlet_orders WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('order_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM availability_records WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('record_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM visibility_records WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('record_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM posm_records WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('record_date', c)}
        UNION ALL SELECT spg_id, validation_status::text FROM competitor_observations WHERE spg_id = ANY(${ids(c)}) AND ${inPeriod('observation_date', c)}
      ) x WHERE st IN ('VALIDATED','APPROVED','NEEDS_REVIEW','REJECTED') GROUP BY spg_id` },

  'intel.competitor_coverage_pct': { kind: 'ratio', source: 'visits + competitor_observations',
    sql: (c) => Prisma.sql`SELECT v.spg_id, count(DISTINCT v.outlet_id) FILTER (WHERE EXISTS (
        SELECT 1 FROM competitor_observations co WHERE co.spg_id = v.spg_id AND co.outlet_id = v.outlet_id AND ${fin('co.validation_status', c)} AND ${inPeriod('co.observation_date', c)})) AS num,
      count(DISTINCT v.outlet_id) AS den FROM (${completedVisits(c)}) v GROUP BY v.spg_id` },

  // ── SPG Grosir ─────────────────────────────
  'wholesale.visit_count': { kind: 'count', source: 'visits (WHOLESALER)',
    sql: (c) => Prisma.sql`SELECT spg_id, count(*) AS num, NULL::numeric AS den FROM (${completedVisits(c, 'WHOLESALER')}) v GROUP BY spg_id` },

  'wholesale.retailer_coverage_pct': { kind: 'ratio', source: 'retailer_wholesale_relationships + retailer_transactions',
    sql: (c) => Prisma.sql`SELECT w.assigned_spg_id AS spg_id,
        count(DISTINCT r.retailer_outlet_id) FILTER (WHERE EXISTS (SELECT 1 FROM retailer_transactions t WHERE t.retailer_outlet_id = r.retailer_outlet_id
          AND t.spg_id = w.assigned_spg_id AND ${fin('t.validation_status', c)} AND ${inPeriod('t.transaction_date', c)})) AS num,
        count(DISTINCT r.retailer_outlet_id) AS den
      FROM outlets w JOIN retailer_wholesale_relationships r ON r.wholesaler_outlet_id = w.id AND r.effective_to IS NULL
      JOIN outlets ro ON ro.id = r.retailer_outlet_id AND ro.status <> 'CLOSED'
      WHERE w.assigned_spg_id = ANY(${ids(c)}) AND w.channel = 'WHOLESALER' GROUP BY w.assigned_spg_id` },

  'wholesale.active_retailers': { kind: 'count', source: 'retailer_transactions (window)',
    sql: (c) => Prisma.sql`SELECT t.spg_id, count(DISTINCT t.retailer_outlet_id) AS num, NULL::numeric AS den FROM retailer_transactions t
      WHERE t.spg_id = ANY(${ids(c)}) AND ${fin('t.validation_status', c)} AND t.data_nature = 'ACTUAL'
        AND t.transaction_date >= (${c.endExclusive}::date - ${c.activeWindowDays}::int) AND t.transaction_date < ${c.endExclusive}::date GROUP BY t.spg_id` },

  'wholesale.productive_retailers': { kind: 'count', source: 'retailer_transactions',
    sql: (c) => Prisma.sql`SELECT t.spg_id, count(DISTINCT t.retailer_outlet_id) AS num, NULL::numeric AS den FROM retailer_transactions t
      WHERE t.spg_id = ANY(${ids(c)}) AND ${fin('t.validation_status', c)} AND t.data_nature = 'ACTUAL' AND ${inPeriod('t.transaction_date', c)} GROUP BY t.spg_id` },

  'wholesale.company_buying_retailers': { kind: 'count', source: 'retailer_transaction_items (COMPANY)',
    sql: (c) => Prisma.sql`SELECT t.spg_id, count(DISTINCT t.retailer_outlet_id) AS num, NULL::numeric AS den FROM retailer_transactions t
      JOIN retailer_transaction_items i ON i.transaction_id = t.id AND i.product_owner = 'COMPANY'
      WHERE t.spg_id = ANY(${ids(c)}) AND ${fin('t.validation_status', c)} AND t.data_nature = 'ACTUAL' AND ${inPeriod('t.transaction_date', c)} GROUP BY t.spg_id` },

  'wholesale.tx_volume': { kind: 'count', source: 'retailer_transaction_items (COMPANY)',
    sql: (c) => Prisma.sql`SELECT t.spg_id, sum(i.quantity) AS num, NULL::numeric AS den FROM retailer_transactions t
      JOIN retailer_transaction_items i ON i.transaction_id = t.id AND i.product_owner = 'COMPANY'
      WHERE t.spg_id = ANY(${ids(c)}) AND ${fin('t.validation_status', c)} AND t.data_nature = 'ACTUAL' AND ${inPeriod('t.transaction_date', c)} GROUP BY t.spg_id` },

  'wholesale.tx_value': { kind: 'count', source: 'retailer_transaction_items (COMPANY)',
    sql: (c) => Prisma.sql`SELECT t.spg_id, sum(i.line_total) AS num, NULL::numeric AS den FROM retailer_transactions t
      JOIN retailer_transaction_items i ON i.transaction_id = t.id AND i.product_owner = 'COMPANY'
      WHERE t.spg_id = ANY(${ids(c)}) AND ${fin('t.validation_status', c)} AND t.data_nature = 'ACTUAL' AND ${inPeriod('t.transaction_date', c)} GROUP BY t.spg_id` },

  'wholesale.validation_rate_pct': { kind: 'ratio', source: 'retailer_transactions',
    sql: (c) => Prisma.sql`SELECT t.spg_id, count(*) FILTER (WHERE t.validation_status = 'APPROVED') AS num,
        count(*) FILTER (WHERE t.validation_status IN ('APPROVED','REJECTED')) AS den
      FROM retailer_transactions t WHERE t.spg_id = ANY(${ids(c)}) AND ${inPeriod('t.transaction_date', c)} GROUP BY t.spg_id` },

  // ── SPG HORECA ─────────────────────────────
  'horeca.active_outlet_pct': { kind: 'ratio', source: 'outlets (HORECA) + horeca_sales',
    sql: (c) => Prisma.sql`SELECT o.assigned_spg_id AS spg_id,
        count(DISTINCT o.id) FILTER (WHERE EXISTS (SELECT 1 FROM horeca_sales s WHERE s.outlet_id = o.id AND ${fin('s.validation_status', c)} AND s.data_nature = 'ACTUAL' AND ${inPeriod('s.sale_date', c)})) AS num,
        count(DISTINCT o.id) AS den
      FROM outlets o WHERE o.assigned_spg_id = ANY(${ids(c)}) AND o.channel = 'HORECA' AND o.status = 'ACTIVE' GROUP BY o.assigned_spg_id` },

  'horeca.sku_per_active_outlet': { kind: 'avg', source: 'horeca_sales',
    sql: (c) => Prisma.sql`SELECT spg_id, sum(skus) AS num, count(*) AS den FROM (
        SELECT s.spg_id, s.outlet_id, count(DISTINCT s.product_variant_id) AS skus FROM horeca_sales s
        WHERE s.spg_id = ANY(${ids(c)}) AND ${fin('s.validation_status', c)} AND s.data_nature = 'ACTUAL' AND ${inPeriod('s.sale_date', c)} GROUP BY 1, 2) x GROUP BY spg_id` },

  'horeca.sales_volume': { kind: 'count', source: 'horeca_sales',
    sql: (c) => Prisma.sql`SELECT s.spg_id, sum(s.quantity) AS num, NULL::numeric AS den FROM horeca_sales s
      WHERE s.spg_id = ANY(${ids(c)}) AND ${fin('s.validation_status', c)} AND s.data_nature = 'ACTUAL' AND ${inPeriod('s.sale_date', c)} GROUP BY s.spg_id` },

  'horeca.sales_value': { kind: 'count', source: 'horeca_sales',
    sql: (c) => Prisma.sql`SELECT s.spg_id, sum(s.sales_value) AS num, NULL::numeric AS den FROM horeca_sales s
      WHERE s.spg_id = ANY(${ids(c)}) AND ${fin('s.validation_status', c)} AND s.data_nature = 'ACTUAL' AND ${inPeriod('s.sale_date', c)} GROUP BY s.spg_id` },

  'horeca.repeat_order_outlets': { kind: 'count', source: 'horeca_sales',
    sql: (c) => Prisma.sql`SELECT spg_id, count(*) AS num, NULL::numeric AS den FROM (
        SELECT s.spg_id, s.outlet_id FROM horeca_sales s WHERE s.spg_id = ANY(${ids(c)}) AND s.is_order AND ${fin('s.validation_status', c)} AND s.data_nature = 'ACTUAL' AND ${inPeriod('s.sale_date', c)}
        GROUP BY 1, 2 HAVING count(DISTINCT s.sale_date) >= 2) x GROUP BY spg_id` },

  'horeca.posm_compliance_pct': posmCompliance('HORECA'),

  'horeca.program_execution_pct': { kind: 'ratio', source: 'horeca_program_implementations',
    sql: (c) => Prisma.sql`SELECT p.spg_id, sum(CASE p.status WHEN 'EXECUTED' THEN 1 WHEN 'PARTIAL' THEN 0.5 ELSE 0 END) AS num, count(*) AS den
      FROM horeca_program_implementations p WHERE p.spg_id = ANY(${ids(c)}) AND ${fin('p.validation_status', c)} AND ${inPeriod('p.implementation_date', c)} GROUP BY p.spg_id` },

  // ── SPG Reguler ─────────────────────────────
  'regular.productive_visit_pct': { kind: 'ratio', source: 'visits (REGULAR) + outlet_orders',
    sql: (c) => Prisma.sql`SELECT v.spg_id, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM outlet_orders o WHERE o.visit_id = v.id AND ${fin('o.validation_status', c)} AND o.status <> 'CANCELLED')) AS num,
        count(*) AS den FROM (${completedVisits(c, 'REGULAR')}) v GROUP BY v.spg_id` },

  'regular.availability_pct': { kind: 'ratio', source: 'availability_records',
    sql: (c) => Prisma.sql`SELECT a.spg_id, count(*) FILTER (WHERE a.is_available) AS num, count(*) AS den FROM availability_records a
      WHERE a.spg_id = ANY(${ids(c)}) AND ${fin('a.validation_status', c)} AND ${inPeriod('a.record_date', c)} GROUP BY a.spg_id` },

  'regular.sku_penetration_pct': { kind: 'ratio', source: 'availability_records',
    sql: (c) => Prisma.sql`SELECT a.spg_id, count(DISTINCT (a.outlet_id, a.product_variant_id)) FILTER (WHERE a.is_available) AS num,
        count(DISTINCT (a.outlet_id, a.product_variant_id)) AS den FROM availability_records a
      WHERE a.spg_id = ANY(${ids(c)}) AND ${fin('a.validation_status', c)} AND ${inPeriod('a.record_date', c)} GROUP BY a.spg_id` },

  'regular.share_of_shelf_pct': { kind: 'ratio', source: 'visibility_records',
    sql: (c) => Prisma.sql`SELECT r.spg_id, sum(r.company_facing) AS num, sum(r.total_category_facing) AS den FROM visibility_records r
      WHERE r.spg_id = ANY(${ids(c)}) AND ${fin('r.validation_status', c)} AND r.total_category_facing > 0 AND ${inPeriod('r.record_date', c)} GROUP BY r.spg_id` },

  'regular.sales_volume': { kind: 'count', source: 'outlet_orders',
    sql: (c) => Prisma.sql`SELECT o.spg_id, sum(o.total_quantity) AS num, NULL::numeric AS den FROM outlet_orders o
      WHERE o.spg_id = ANY(${ids(c)}) AND ${fin('o.validation_status', c)} AND o.data_nature = 'ACTUAL' AND o.status <> 'CANCELLED' AND ${inPeriod('o.order_date', c)} GROUP BY o.spg_id` },

  'regular.sales_value': { kind: 'count', source: 'outlet_orders',
    sql: (c) => Prisma.sql`SELECT o.spg_id, sum(o.total_value) AS num, NULL::numeric AS den FROM outlet_orders o
      WHERE o.spg_id = ANY(${ids(c)}) AND ${fin('o.validation_status', c)} AND o.data_nature = 'ACTUAL' AND o.status <> 'CANCELLED' AND ${inPeriod('o.order_date', c)} GROUP BY o.spg_id` },

  'regular.order_conversion_pct': { kind: 'ratio', source: 'visits (REGULAR) + outlet_orders',
    sql: (c) => Prisma.sql`SELECT v.spg_id, count(DISTINCT v.outlet_id) FILTER (WHERE EXISTS (SELECT 1 FROM outlet_orders o WHERE o.outlet_id = v.outlet_id AND o.spg_id = v.spg_id
          AND ${fin('o.validation_status', c)} AND o.status <> 'CANCELLED' AND ${inPeriod('o.order_date', c)})) AS num,
        count(DISTINCT v.outlet_id) AS den FROM (${completedVisits(c, 'REGULAR')}) v GROUP BY v.spg_id` },

  'regular.posm_compliance_pct': posmCompliance('REGULAR'),
};

/** Converts a metric row into the KPI actual value according to the metric kind. */
export function metricValue(kind: MetricDef['kind'], row: MetricRow | undefined, spgWasActive: boolean): number | null {
  if (!row) return kind === 'count' && spgWasActive ? 0 : null; // inactive SPG ⇒ NO_DATA, never an implicit zero
  const num = row.num == null ? null : Number(row.num);
  const den = row.den == null ? null : Number(row.den);
  if (kind === 'count') return num ?? (spgWasActive ? 0 : null);
  if (num == null || den == null || den === 0) return null;
  const v = kind === 'ratio' ? (num / den) * 100 : num / den;
  return Math.round(v * 10000) / 10000;
}

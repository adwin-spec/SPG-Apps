import { Prisma } from '@tanda/database';
import { periodMonth } from '@tanda/shared';
import type { ResolvedFilter } from '../analytics/filter.service';
import { salesCte } from '../analytics/analytics.service';

export interface Column { key: string; label: string; type?: 'text' | 'number' | 'money' | 'pct' | 'date' }
export interface ReportDef { title: string; columns: Column[]; sql: (r: ResolvedFilter) => Prisma.Sql }

const ids = (r: ResolvedFilter) => Prisma.sql`${r.spgIds}::uuid[]`;
const fin = (col: string, r: ResolvedFilter) => Prisma.sql`${Prisma.raw(col)}::text = ANY(${r.final}::text[])`;
const between = (col: string, r: ResolvedFilter) => Prisma.sql`${Prisma.raw(col)} >= ${r.from}::date AND ${Prisma.raw(col)} < ${r.toExclusive}::date`;
const spgCols: Column[] = [{ key: 'employee_code', label: 'SPG ID' }, { key: 'spg', label: 'SPG' }, { key: 'category', label: 'Category' }, { key: 'area', label: 'Area' }, { key: 'supervisor', label: 'Supervisor' }];
const spgJoin = Prisma.sql`JOIN spg_categories c ON c.id = s.category_id JOIN areas ar ON ar.id = s.current_area_id LEFT JOIN supervisors sv ON sv.id = s.current_supervisor_id LEFT JOIN users su ON su.id = sv.user_id`;
const spgSel = Prisma.sql`s.employee_code, s.full_name AS spg, c.code AS category, ar.name AS area, su.full_name AS supervisor`;
const perfReport = (title: string): ReportDef => ({
  title,
  columns: [{ key: 'period', label: 'Period' }, ...spgCols, { key: 'total_score', label: 'Score', type: 'number' }, { key: 'activity_score', label: 'Activity score', type: 'number' },
    { key: 'outcome_score', label: 'Outcome score', type: 'number' }, { key: 'weight_coverage', label: 'Weight coverage %', type: 'pct' }, { key: 'rank_in_category', label: 'Rank', type: 'number' }, { key: 'performance_status', label: 'Status' }],
  sql: (r) => Prisma.sql`SELECT to_char(ps.period_month, 'YYYY-MM') AS period, ${spgSel}, ps.total_score, ps.activity_score, ps.outcome_score, ps.weight_coverage, ps.rank_in_category, ps.performance_status
    FROM performance_snapshots ps JOIN spgs s ON s.id = ps.spg_id ${spgJoin}
    WHERE ps.spg_id = ANY(${ids(r)}) AND ps.period_month BETWEEN ${periodMonth(r.from)}::date AND ${periodMonth(r.to)}::date ORDER BY ps.period_month, c.code, ps.rank_in_category NULLS LAST`,
});
const posmReport = (): ReportDef => ({
  title: 'POSM Compliance',
  columns: [...spgCols, { key: 'outlet', label: 'Outlet' }, { key: 'channel', label: 'Channel' }, { key: 'installed', label: 'Installed', type: 'number' }, { key: 'missing', label: 'Missing', type: 'number' },
    { key: 'damaged', label: 'Damaged', type: 'number' }, { key: 'compliance_pct', label: 'Compliance %', type: 'pct' }],
  sql: (r) => Prisma.sql`SELECT ${spgSel}, o.name AS outlet, p.channel, count(*) FILTER (WHERE p.status = 'INSTALLED') AS installed, count(*) FILTER (WHERE p.status = 'MISSING') AS missing,
    count(*) FILTER (WHERE p.status = 'DAMAGED') AS damaged, round(100.0 * count(*) FILTER (WHERE p.status = 'INSTALLED') / NULLIF(count(*) FILTER (WHERE p.status <> 'NOT_APPLICABLE'), 0), 2) AS compliance_pct
    FROM posm_records p JOIN spgs s ON s.id = p.spg_id ${spgJoin} JOIN outlets o ON o.id = p.outlet_id
    WHERE p.spg_id = ANY(${ids(r)}) AND ${fin('p.validation_status', r)} AND ${between('p.record_date', r)} ${r.outletSql('p.outlet_id')} GROUP BY 1,2,3,4,5,6,7 ORDER BY compliance_pct NULLS FIRST`,
});

export const REPORTS: Record<string, ReportDef> = {
  'daily-spg': {
    title: 'Daily SPG Report',
    columns: [{ key: 'work_date', label: 'Date', type: 'date' }, ...spgCols, { key: 'check_in', label: 'Check-in (WIB)' }, { key: 'check_out', label: 'Check-out (WIB)' },
      { key: 'visits', label: 'Visits', type: 'number' }, { key: 'outside_geofence', label: 'Outside geofence', type: 'number' }, { key: 'report_status', label: 'Report' }, { key: 'is_late', label: 'Late' }, { key: 'completeness', label: 'Completeness %', type: 'pct' }],
    sql: (r) => Prisma.sql`SELECT a.work_date, ${spgSel}, to_char(a.check_in_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS check_in, to_char(a.check_out_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS check_out,
      (SELECT count(*) FROM visits v WHERE v.spg_id = s.id AND v.visit_date = a.work_date AND v.status = 'COMPLETED') AS visits,
      (SELECT count(*) FROM visits v WHERE v.spg_id = s.id AND v.visit_date = a.work_date AND v.geofence_status = 'OUTSIDE') AS outside_geofence,
      COALESCE(d.status::text, 'MISSING') AS report_status, CASE WHEN d.is_late THEN 'Yes' ELSE 'No' END AS is_late, d.completeness_score AS completeness
      FROM attendance a JOIN spgs s ON s.id = a.spg_id ${spgJoin} LEFT JOIN daily_reports d ON d.spg_id = a.spg_id AND d.report_date = a.work_date
      WHERE a.spg_id = ANY(${ids(r)}) AND ${between('a.work_date', r)} ORDER BY a.work_date DESC, s.full_name`,
  },
  'weekly-performance': {
    title: 'Weekly Performance Report',
    columns: [{ key: 'week', label: 'Week starting' }, ...spgCols, { key: 'days_worked', label: 'Days worked', type: 'number' }, { key: 'visits', label: 'Visits', type: 'number' },
      { key: 'outlets', label: 'Outlets visited', type: 'number' }, { key: 'sales_value', label: 'Sales value (final)', type: 'money' }, { key: 'reports_on_time', label: 'Reports on time', type: 'number' }],
    sql: (r) => Prisma.sql`WITH ${salesCte(r)}, w AS (SELECT a.spg_id, date_trunc('week', a.work_date)::date AS week, count(*) AS days_worked FROM attendance a WHERE a.spg_id = ANY(${ids(r)}) AND ${between('a.work_date', r)} GROUP BY 1, 2)
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week, ${spgSel}, w.days_worked,
        (SELECT count(*) FROM visits v WHERE v.spg_id = w.spg_id AND v.status = 'COMPLETED' AND date_trunc('week', v.visit_date)::date = w.week) AS visits,
        (SELECT count(DISTINCT v.outlet_id) FROM visits v WHERE v.spg_id = w.spg_id AND v.status = 'COMPLETED' AND date_trunc('week', v.visit_date)::date = w.week) AS outlets,
        (SELECT COALESCE(sum(value), 0) FROM sales WHERE sales.spg_id = w.spg_id AND date_trunc('week', sales.d)::date = w.week) AS sales_value,
        (SELECT count(*) FROM daily_reports d WHERE d.spg_id = w.spg_id AND NOT d.is_late AND d.status <> 'DRAFT' AND date_trunc('week', d.report_date)::date = w.week) AS reports_on_time
      FROM w JOIN spgs s ON s.id = w.spg_id ${spgJoin} ORDER BY w.week DESC, s.full_name`,
  },
  'monthly-performance': perfReport('Monthly Performance Report'),
  'spg-ranking': perfReport('SPG Ranking'),
  'visit-productivity': {
    title: 'Visit Productivity',
    columns: [...spgCols, { key: 'visits', label: 'Completed visits', type: 'number' }, { key: 'planned', label: 'Planned', type: 'number' }, { key: 'planned_visited', label: 'Planned & visited', type: 'number' },
      { key: 'compliance_pct', label: 'Visit compliance %', type: 'pct' }, { key: 'unplanned', label: 'Unplanned', type: 'number' }, { key: 'avg_duration_min', label: 'Avg duration (min)', type: 'number' }, { key: 'outside_geofence', label: 'Outside geofence', type: 'number' }],
    sql: (r) => Prisma.sql`SELECT ${spgSel},
      (SELECT count(*) FROM visits v WHERE v.spg_id = s.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS visits,
      (SELECT count(*) FROM visit_plans p WHERE p.spg_id = s.id AND p.status <> 'CANCELLED' AND ${between('p.planned_date', r)}) AS planned,
      (SELECT count(*) FROM visit_plans p WHERE p.spg_id = s.id AND p.status = 'VISITED' AND ${between('p.planned_date', r)}) AS planned_visited,
      round(100.0 * (SELECT count(*) FROM visit_plans p WHERE p.spg_id = s.id AND p.status = 'VISITED' AND ${between('p.planned_date', r)}) / NULLIF((SELECT count(*) FROM visit_plans p WHERE p.spg_id = s.id AND p.status <> 'CANCELLED' AND ${between('p.planned_date', r)}), 0), 2) AS compliance_pct,
      (SELECT count(*) FROM visits v WHERE v.spg_id = s.id AND NOT v.is_planned AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS unplanned,
      (SELECT round(avg(v.duration_min), 1) FROM visits v WHERE v.spg_id = s.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS avg_duration_min,
      (SELECT count(*) FROM visits v WHERE v.spg_id = s.id AND v.geofence_status = 'OUTSIDE' AND ${between('v.visit_date', r)}) AS outside_geofence
      FROM spgs s ${spgJoin} WHERE s.id = ANY(${ids(r)}) ORDER BY compliance_pct NULLS LAST`,
  },
  'sales-achievement': {
    title: 'Sales Achievement',
    columns: [{ key: 'period', label: 'Period' }, ...spgCols, { key: 'kpi', label: 'KPI' }, { key: 'actual_value', label: 'Actual', type: 'number' }, { key: 'target_value', label: 'Target', type: 'number' },
      { key: 'achievement_pct', label: 'Achievement %', type: 'pct' }, { key: 'data_status', label: 'Data status' }],
    sql: (r) => Prisma.sql`SELECT to_char(pr.period_month, 'YYYY-MM') AS period, ${spgSel}, k.name AS kpi, pr.actual_value, pr.target_value, pr.achievement_pct, pr.data_status
      FROM performance_results pr JOIN kpi_definitions k ON k.id = pr.kpi_definition_id JOIN spgs s ON s.id = pr.spg_id ${spgJoin}
      WHERE pr.spg_id = ANY(${ids(r)}) AND k.dimension = 'COMMERCIAL' AND pr.period_month BETWEEN ${periodMonth(r.from)}::date AND ${periodMonth(r.to)}::date ORDER BY 1, s.full_name, k.display_order`,
  },
  'outlet-coverage': {
    title: 'Outlet Coverage',
    columns: [...spgCols, { key: 'assigned', label: 'Assigned active outlets', type: 'number' }, { key: 'visited', label: 'Visited', type: 'number' }, { key: 'coverage_pct', label: 'Coverage %', type: 'pct' }, { key: 'never_visited', label: 'Not visited (names)' }],
    sql: (r) => Prisma.sql`SELECT ${spgSel}, count(o.id) AS assigned, count(o.id) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.outlet_id = o.id AND v.spg_id = s.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)})) AS visited,
      round(100.0 * count(o.id) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.outlet_id = o.id AND v.spg_id = s.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)})) / NULLIF(count(o.id), 0), 2) AS coverage_pct,
      string_agg(o.name, '; ') FILTER (WHERE NOT EXISTS (SELECT 1 FROM visits v WHERE v.outlet_id = o.id AND v.spg_id = s.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)})) AS never_visited
      FROM spgs s ${spgJoin} JOIN outlets o ON o.assigned_spg_id = s.id AND o.status = 'ACTIVE' WHERE s.id = ANY(${ids(r)}) ${r.outletSql('o.id')} GROUP BY 1,2,3,4,5 ORDER BY coverage_pct NULLS FIRST`,
  },
  'wholesale-performance': {
    title: 'Wholesale Performance',
    columns: [{ key: 'wholesaler_code', label: 'Grosir ID' }, { key: 'wholesaler', label: 'Grosir' }, { key: 'district', label: 'Kabupaten' }, { key: 'spg', label: 'SPG' }, { key: 'visits', label: 'Visits', type: 'number' },
      { key: 'registered_retailers', label: 'Registered retailers', type: 'number' }, { key: 'transacting_retailers', label: 'Transacting retailers', type: 'number' }, { key: 'company_buying_retailers', label: 'Company-buying retailers', type: 'number' },
      { key: 'company_qty', label: 'Company qty', type: 'number' }, { key: 'company_value', label: 'Company value', type: 'money' }, { key: 'competitor_value', label: 'Competitor value', type: 'money' }],
    sql: (r) => Prisma.sql`SELECT w.code AS wholesaler_code, w.name AS wholesaler, d.name AS district, s.full_name AS spg,
      (SELECT count(*) FROM visits v WHERE v.outlet_id = w.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS visits,
      (SELECT count(*) FROM retailer_wholesale_relationships rw WHERE rw.wholesaler_outlet_id = w.id AND rw.effective_to IS NULL) AS registered_retailers,
      count(DISTINCT t.retailer_outlet_id) AS transacting_retailers, count(DISTINCT t.retailer_outlet_id) FILTER (WHERE i.product_owner = 'COMPANY') AS company_buying_retailers,
      COALESCE(sum(i.quantity) FILTER (WHERE i.product_owner = 'COMPANY'), 0) AS company_qty, COALESCE(sum(i.line_total) FILTER (WHERE i.product_owner = 'COMPANY'), 0) AS company_value,
      COALESCE(sum(i.line_total) FILTER (WHERE i.product_owner = 'COMPETITOR'), 0) AS competitor_value
      FROM outlets w JOIN districts d ON d.id = w.district_id LEFT JOIN spgs s ON s.id = w.assigned_spg_id
      LEFT JOIN retailer_transactions t ON t.wholesaler_outlet_id = w.id AND ${fin('t.validation_status', r)} AND t.data_nature = 'ACTUAL' AND ${between('t.transaction_date', r)}
      LEFT JOIN retailer_transaction_items i ON i.transaction_id = t.id
      WHERE w.channel = 'WHOLESALER' AND w.assigned_spg_id = ANY(${ids(r)}) ${r.outletSql('w.id')} GROUP BY w.id, d.name, s.full_name ORDER BY company_value DESC`,
  },
  'retailer-transactions': {
    title: 'Retailer Transactions (line level)',
    columns: [{ key: 'transaction_no', label: 'Transaction ID' }, { key: 'transaction_date', label: 'Date', type: 'date' }, { key: 'status', label: 'Validation' }, { key: 'data_nature', label: 'Nature' },
      { key: 'retailer_code', label: 'Retailer ID' }, { key: 'retailer', label: 'Retailer' }, { key: 'wholesaler', label: 'Grosir' }, { key: 'spg', label: 'SPG' }, { key: 'owner', label: 'Owner' },
      { key: 'brand', label: 'Brand' }, { key: 'sku', label: 'SKU' }, { key: 'quantity', label: 'Qty', type: 'number' }, { key: 'unit', label: 'Unit' }, { key: 'unit_price', label: 'Price', type: 'money' }, { key: 'line_total', label: 'Total', type: 'money' }],
    sql: (r) => Prisma.sql`SELECT t.transaction_no, t.transaction_date, t.validation_status AS status, t.data_nature, ro.code AS retailer_code, ro.name AS retailer, wo.name AS wholesaler, s.full_name AS spg, i.product_owner AS owner,
      COALESCE(b.name, cb.name, i.brand_text) AS brand, COALESCE(pv.sku, cp.sku, i.sku_text) AS sku, i.quantity, i.unit, i.unit_price, i.line_total
      FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id JOIN outlets ro ON ro.id = t.retailer_outlet_id LEFT JOIN outlets wo ON wo.id = t.wholesaler_outlet_id JOIN spgs s ON s.id = t.spg_id
      LEFT JOIN product_variants pv ON pv.id = i.product_variant_id LEFT JOIN products p ON p.id = pv.product_id LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN competitor_products cp ON cp.id = i.competitor_product_id LEFT JOIN brands cb ON cb.id = cp.brand_id
      WHERE t.spg_id = ANY(${ids(r)}) AND ${between('t.transaction_date', r)} ${r.outletSql('t.retailer_outlet_id')} ORDER BY t.transaction_date DESC, t.transaction_no, i.line_no`,
  },
  'horeca-performance': {
    title: 'HORECA Performance',
    columns: [{ key: 'outlet_code', label: 'Outlet ID' }, { key: 'outlet', label: 'Outlet' }, { key: 'category', label: 'Category' }, { key: 'spg', label: 'SPG' }, { key: 'visits', label: 'Visits', type: 'number' },
      { key: 'sales_qty', label: 'Sales qty', type: 'number' }, { key: 'sales_value', label: 'Sales value', type: 'money' }, { key: 'skus', label: 'Active SKUs', type: 'number' }, { key: 'repeat_orders', label: 'Repeat orders', type: 'number' },
      { key: 'programs_executed', label: 'Programs executed', type: 'number' }, { key: 'posm_installed', label: 'POSM installed', type: 'number' }],
    sql: (r) => Prisma.sql`SELECT o.code AS outlet_code, o.name AS outlet, oc.name AS category, s.full_name AS spg,
      (SELECT count(*) FROM visits v WHERE v.outlet_id = o.id AND v.status = 'COMPLETED' AND ${between('v.visit_date', r)}) AS visits,
      COALESCE(sum(hs.quantity), 0) AS sales_qty, COALESCE(sum(hs.sales_value), 0) AS sales_value, count(DISTINCT hs.product_variant_id) AS skus, count(*) FILTER (WHERE hs.is_repeat_order) AS repeat_orders,
      (SELECT count(*) FROM horeca_program_implementations pi WHERE pi.outlet_id = o.id AND pi.status = 'EXECUTED' AND ${between('pi.implementation_date', r)}) AS programs_executed,
      (SELECT count(*) FROM posm_records pr WHERE pr.outlet_id = o.id AND pr.status = 'INSTALLED' AND ${between('pr.record_date', r)}) AS posm_installed
      FROM outlets o LEFT JOIN outlet_categories oc ON oc.id = o.category_id LEFT JOIN spgs s ON s.id = o.assigned_spg_id
      LEFT JOIN horeca_sales hs ON hs.outlet_id = o.id AND ${fin('hs.validation_status', r)} AND hs.data_nature = 'ACTUAL' AND ${between('hs.sale_date', r)}
      WHERE o.channel = 'HORECA' AND o.assigned_spg_id = ANY(${ids(r)}) ${r.outletSql('o.id')} GROUP BY o.id, oc.name, s.full_name ORDER BY sales_value DESC`,
  },
  'competitor-intelligence': {
    title: 'Competitor Intelligence',
    columns: [{ key: 'observation_date', label: 'Date', type: 'date' }, { key: 'channel', label: 'Channel' }, { key: 'outlet', label: 'Outlet' }, { key: 'district', label: 'Kabupaten' }, { key: 'subdistrict', label: 'Kecamatan' },
      { key: 'brand', label: 'Brand' }, { key: 'product', label: 'Product / SKU' }, { key: 'purchase_price', label: 'Purchase price', type: 'money' }, { key: 'selling_price', label: 'Selling price', type: 'money' },
      { key: 'stock', label: 'Stock' }, { key: 'quantity_purchased', label: 'Qty purchased', type: 'number' }, { key: 'promotion', label: 'Promotion' }, { key: 'spg', label: 'SPG' }, { key: 'status', label: 'Validation' }],
    sql: (r) => Prisma.sql`SELECT co.observation_date, co.channel, o.name AS outlet, d.name AS district, sd.name AS subdistrict, COALESCE(b.name, co.brand_text) AS brand,
      COALESCE(cp.name || COALESCE(' ' || cp.variant, ''), co.sku_text) AS product, co.purchase_price, co.selling_price, co.stock_availability AS stock, co.quantity_purchased,
      co.promotion_detail AS promotion, s.full_name AS spg, co.validation_status AS status
      FROM competitor_observations co JOIN outlets o ON o.id = co.outlet_id JOIN districts d ON d.id = o.district_id LEFT JOIN subdistricts sd ON sd.id = o.subdistrict_id
      LEFT JOIN brands b ON b.id = co.brand_id LEFT JOIN competitor_products cp ON cp.id = co.competitor_product_id JOIN spgs s ON s.id = co.spg_id
      WHERE co.spg_id = ANY(${ids(r)}) AND ${between('co.observation_date', r)} ${r.outletSql('co.outlet_id')} ${r.brandSql('co.brand_id')} ORDER BY co.observation_date DESC`,
  },
  availability: {
    title: 'Availability Report',
    columns: [{ key: 'outlet', label: 'Outlet' }, { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'checks', label: 'Checks', type: 'number' }, { key: 'available', label: 'Available', type: 'number' },
      { key: 'availability_pct', label: 'Availability %', type: 'pct' }, { key: 'last_oos_reason', label: 'Last OOS reason' }, { key: 'last_check', label: 'Last check', type: 'date' }],
    sql: (r) => Prisma.sql`SELECT o.name AS outlet, pv.sku, pv.name AS product, count(*) AS checks, count(*) FILTER (WHERE a.is_available) AS available,
      round(100.0 * count(*) FILTER (WHERE a.is_available) / count(*), 2) AS availability_pct, (array_agg(a.oos_reason ORDER BY a.record_date DESC) FILTER (WHERE NOT a.is_available))[1] AS last_oos_reason, max(a.record_date) AS last_check
      FROM availability_records a JOIN outlets o ON o.id = a.outlet_id JOIN product_variants pv ON pv.id = a.product_variant_id
      WHERE a.spg_id = ANY(${ids(r)}) AND ${fin('a.validation_status', r)} AND ${between('a.record_date', r)} ${r.outletSql('a.outlet_id')} ${r.variantSql('a.product_variant_id')} GROUP BY o.name, pv.sku, pv.name ORDER BY availability_pct`,
  },
  visibility: {
    title: 'Visibility Report (Share of Shelf)',
    columns: [{ key: 'outlet', label: 'Outlet' }, { key: 'spg', label: 'SPG' }, { key: 'records', label: 'Records', type: 'number' }, { key: 'company_facing', label: 'Company facing', type: 'number' },
      { key: 'competitor_facing', label: 'Competitor facing', type: 'number' }, { key: 'total_facing', label: 'Total category facing', type: 'number' }, { key: 'share_of_shelf_pct', label: 'Share of Shelf %', type: 'pct' }, { key: 'displays', label: 'With display', type: 'number' }],
    sql: (r) => Prisma.sql`SELECT o.name AS outlet, s.full_name AS spg, count(*) AS records, sum(v.company_facing) AS company_facing, sum(v.competitor_facing) AS competitor_facing, sum(v.total_category_facing) AS total_facing,
      round(100.0 * sum(v.company_facing) / NULLIF(sum(v.total_category_facing), 0), 2) AS share_of_shelf_pct, count(*) FILTER (WHERE v.has_display) AS displays
      FROM visibility_records v JOIN outlets o ON o.id = v.outlet_id JOIN spgs s ON s.id = v.spg_id
      WHERE v.spg_id = ANY(${ids(r)}) AND ${fin('v.validation_status', r)} AND ${between('v.record_date', r)} ${r.outletSql('v.outlet_id')} GROUP BY o.name, s.full_name ORDER BY share_of_shelf_pct NULLS FIRST`,
  },
  'posm-compliance': posmReport(),
  'data-quality': {
    title: 'Data Quality Report',
    columns: [{ key: 'rule_code', label: 'Rule' }, { key: 'dimension', label: 'Dimension' }, { key: 'severity', label: 'Severity' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'Entity ID' },
      { key: 'spg', label: 'SPG' }, { key: 'message', label: 'Message' }, { key: 'status', label: 'Status' }, { key: 'detected_at', label: 'Detected', type: 'date' }],
    sql: (r) => Prisma.sql`SELECT i.rule_code, i.dimension, i.severity, i.entity_type, i.entity_id::text, s.full_name AS spg, i.message, i.status, i.detected_at
      FROM data_quality_issues i LEFT JOIN spgs s ON s.id = i.spg_id WHERE (i.spg_id IS NULL OR i.spg_id = ANY(${ids(r)})) AND i.detected_at >= ${r.from}::date AND i.detected_at < ${r.toExclusive}::date ORDER BY i.severity DESC, i.detected_at DESC`,
  },
};

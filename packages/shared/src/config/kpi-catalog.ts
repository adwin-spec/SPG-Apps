/**
 * KPI metric catalogue (ADR D6). Each metric is implemented as a safe, parameterised SQL
 * query in the API (`apps/api/src/kpi/metrics`). Admins compose KPI definitions from these.
 * Every metric respects `kpi.finalStatuses` and excludes SUPERSEDED / REVERSED / duplicates.
 */
export type MetricChannel = 'ALL' | 'GROSIR' | 'HORECA' | 'REGULER';
export interface MetricMeta {
  key: string;
  label: string;
  channel: MetricChannel;
  unit: 'count' | 'pct' | 'qty' | 'idr';
  isActivity: boolean;
  description: string;
}

export const METRIC_CATALOG: MetricMeta[] = [
  { key: 'visits.completed_count', label: 'Completed visits', channel: 'ALL', unit: 'count', isActivity: true, description: 'Completed visits in period' },
  { key: 'visits.effective_count', label: 'Effective visits', channel: 'ALL', unit: 'count', isActivity: true, description: 'Completed visits ≥ min duration with ≥1 business record' },
  { key: 'visits.plan_compliance_pct', label: 'Visit compliance', channel: 'ALL', unit: 'pct', isActivity: true, description: 'Planned visits executed / planned visits × 100' },
  { key: 'outlets.coverage_pct', label: 'Assigned outlet coverage', channel: 'ALL', unit: 'pct', isActivity: true, description: 'Distinct assigned outlets visited / assigned active outlets × 100' },
  { key: 'reports.compliance_pct', label: 'Reporting compliance', channel: 'ALL', unit: 'pct', isActivity: true, description: 'On-time submitted daily reports / attended work days × 100' },
  { key: 'data.validation_pass_pct', label: 'Data accuracy (validation pass rate)', channel: 'ALL', unit: 'pct', isActivity: true, description: 'Records VALIDATED or APPROVED / all non-superseded records × 100' },
  { key: 'intel.competitor_coverage_pct', label: 'Competitor intelligence coverage', channel: 'ALL', unit: 'pct', isActivity: true, description: 'Visited outlets with ≥1 competitor observation / visited outlets × 100' },

  { key: 'wholesale.visit_count', label: 'Wholesale visits', channel: 'GROSIR', unit: 'count', isActivity: true, description: 'Completed visits to wholesalers' },
  { key: 'wholesale.retailer_coverage_pct', label: 'Retailer coverage', channel: 'GROSIR', unit: 'pct', isActivity: true, description: 'Linked retailers with ≥1 recorded transaction / registered retailers linked to SPG wholesalers × 100' },
  { key: 'wholesale.active_retailers', label: 'Active retailers', channel: 'GROSIR', unit: 'count', isActivity: false, description: 'Distinct retailers with any final transaction within the active window' },
  { key: 'wholesale.productive_retailers', label: 'Productive retailers', channel: 'GROSIR', unit: 'count', isActivity: false, description: 'Distinct retailers with a final ACTUAL transaction in period' },
  { key: 'wholesale.company_buying_retailers', label: 'Company-product buying retailers', channel: 'GROSIR', unit: 'count', isActivity: false, description: 'Distinct retailers with a final company-product line in period' },
  { key: 'wholesale.tx_volume', label: 'Transaction volume (company)', channel: 'GROSIR', unit: 'qty', isActivity: false, description: 'Sum of company-product quantity, final ACTUAL' },
  { key: 'wholesale.tx_value', label: 'Transaction value (company)', channel: 'GROSIR', unit: 'idr', isActivity: false, description: 'Sum of company-product line value, final ACTUAL' },
  { key: 'wholesale.validation_rate_pct', label: 'Transaction validation rate', channel: 'GROSIR', unit: 'pct', isActivity: true, description: 'Approved transactions / submitted transactions × 100' },

  { key: 'horeca.active_outlet_pct', label: 'Active outlets (penetration)', channel: 'HORECA', unit: 'pct', isActivity: false, description: 'Assigned outlets with ≥1 final sale / assigned outlets × 100' },
  { key: 'horeca.sku_per_active_outlet', label: 'SKU per active outlet', channel: 'HORECA', unit: 'count', isActivity: false, description: 'Average distinct SKUs sold per active outlet' },
  { key: 'horeca.sales_volume', label: 'Sales volume', channel: 'HORECA', unit: 'qty', isActivity: false, description: 'Sum of final ACTUAL sales quantity' },
  { key: 'horeca.sales_value', label: 'Sales value', channel: 'HORECA', unit: 'idr', isActivity: false, description: 'Sum of final ACTUAL sales value' },
  { key: 'horeca.repeat_order_outlets', label: 'Repeat-order outlets', channel: 'HORECA', unit: 'count', isActivity: false, description: 'Outlets with ≥2 distinct order days in period' },
  { key: 'horeca.posm_compliance_pct', label: 'POSM compliance', channel: 'HORECA', unit: 'pct', isActivity: true, description: 'POSM INSTALLED / audited POSM × 100' },
  { key: 'horeca.program_execution_pct', label: 'Program execution', channel: 'HORECA', unit: 'pct', isActivity: true, description: 'EXECUTED (+½ PARTIAL) / recorded implementations × 100' },

  { key: 'regular.productive_visit_pct', label: 'Productive visits', channel: 'REGULER', unit: 'pct', isActivity: true, description: 'Completed visits with an order / completed visits × 100' },
  { key: 'regular.availability_pct', label: 'Availability', channel: 'REGULER', unit: 'pct', isActivity: false, description: 'Available SKU checks / SKU checks × 100' },
  { key: 'regular.sku_penetration_pct', label: 'SKU penetration', channel: 'REGULER', unit: 'pct', isActivity: false, description: 'Distinct (outlet, SKU) available / distinct (outlet, SKU) checked × 100' },
  { key: 'regular.share_of_shelf_pct', label: 'Share of Shelf', channel: 'REGULER', unit: 'pct', isActivity: false, description: 'Σ company facing / Σ total category facing × 100' },
  { key: 'regular.sales_volume', label: 'Sales volume', channel: 'REGULER', unit: 'qty', isActivity: false, description: 'Sum of final order quantity' },
  { key: 'regular.sales_value', label: 'Sales value', channel: 'REGULER', unit: 'idr', isActivity: false, description: 'Sum of final order value' },
  { key: 'regular.order_conversion_pct', label: 'Order conversion', channel: 'REGULER', unit: 'pct', isActivity: false, description: 'Distinct outlets ordering / distinct outlets visited × 100' },
  { key: 'regular.posm_compliance_pct', label: 'POSM compliance', channel: 'REGULER', unit: 'pct', isActivity: true, description: 'POSM INSTALLED / audited POSM × 100' },
];

export const METRIC_KEYS = METRIC_CATALOG.map((m) => m.key);

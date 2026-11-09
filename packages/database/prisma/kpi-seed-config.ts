/**
 * SIMULATION KPI configuration (brief §I). Weights follow the brief's example
 * (Productivity 20 / Coverage 20 / Commercial 25 / Execution 15 / Data Quality 10 / Reporting 10)
 * and are NOT company policy. Admins change them in the UI (history is preserved).
 */
type Dim = 'PRODUCTIVITY' | 'COVERAGE' | 'COMMERCIAL' | 'EXECUTION' | 'INTELLIGENCE' | 'DATA_QUALITY' | 'REPORTING_COMPLIANCE';
export interface SeedKpi { code: string; name: string; dimension: Dim; metricKey: string; unit: string; isActivity: boolean; weight: number }

export const KPI_SEED: Record<'GROSIR' | 'HORECA' | 'REGULER', SeedKpi[]> = {
  GROSIR: [
    { code: 'GR_WHOLESALE_VISIT', name: 'Wholesale Visit', dimension: 'PRODUCTIVITY', metricKey: 'wholesale.visit_count', unit: 'visits', isActivity: true, weight: 10 },
    { code: 'GR_EFFECTIVE_VISIT', name: 'Effective Visit', dimension: 'PRODUCTIVITY', metricKey: 'visits.effective_count', unit: 'visits', isActivity: true, weight: 10 },
    { code: 'GR_RETAILER_COVERAGE', name: 'Retailer Coverage', dimension: 'COVERAGE', metricKey: 'wholesale.retailer_coverage_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'GR_ACTIVE_RETAILER', name: 'Active Retailer', dimension: 'COVERAGE', metricKey: 'wholesale.active_retailers', unit: 'retailers', isActivity: false, weight: 10 },
    { code: 'GR_PRODUCTIVE_RETAILER', name: 'Productive Retailer', dimension: 'COMMERCIAL', metricKey: 'wholesale.productive_retailers', unit: 'retailers', isActivity: false, weight: 5 },
    { code: 'GR_COMPANY_BUYING_RETAILER', name: 'Company Product Buying Retailer', dimension: 'COMMERCIAL', metricKey: 'wholesale.company_buying_retailers', unit: 'retailers', isActivity: false, weight: 5 },
    { code: 'GR_TX_VOLUME', name: 'Total Transaction Volume', dimension: 'COMMERCIAL', metricKey: 'wholesale.tx_volume', unit: 'qty', isActivity: false, weight: 5 },
    { code: 'GR_TX_VALUE', name: 'Total Transaction Value', dimension: 'COMMERCIAL', metricKey: 'wholesale.tx_value', unit: 'IDR', isActivity: false, weight: 10 },
    { code: 'GR_COMPETITOR_INTEL', name: 'Competitor Intelligence Coverage', dimension: 'INTELLIGENCE', metricKey: 'intel.competitor_coverage_pct', unit: '%', isActivity: true, weight: 15 },
    { code: 'GR_DATA_COMPLETENESS', name: 'Data Completeness / Accuracy', dimension: 'DATA_QUALITY', metricKey: 'data.validation_pass_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'GR_TX_VALIDATION_RATE', name: 'Transaction Validation Rate', dimension: 'DATA_QUALITY', metricKey: 'wholesale.validation_rate_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'GR_REPORTING_COMPLIANCE', name: 'Reporting Compliance', dimension: 'REPORTING_COMPLIANCE', metricKey: 'reports.compliance_pct', unit: '%', isActivity: true, weight: 10 },
  ],
  HORECA: [
    { code: 'HO_EFFECTIVE_VISIT', name: 'Effective Visit', dimension: 'PRODUCTIVITY', metricKey: 'visits.effective_count', unit: 'visits', isActivity: true, weight: 10 },
    { code: 'HO_VISIT_COMPLIANCE', name: 'Visit Compliance', dimension: 'PRODUCTIVITY', metricKey: 'visits.plan_compliance_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'HO_OUTLET_COVERAGE', name: 'Assigned Outlet Coverage', dimension: 'COVERAGE', metricKey: 'outlets.coverage_pct', unit: '%', isActivity: true, weight: 20 },
    { code: 'HO_ACTIVE_OUTLET', name: 'Active Outlet / Product Penetration', dimension: 'COMMERCIAL', metricKey: 'horeca.active_outlet_pct', unit: '%', isActivity: false, weight: 5 },
    { code: 'HO_SALES_VOLUME', name: 'Sales Volume', dimension: 'COMMERCIAL', metricKey: 'horeca.sales_volume', unit: 'qty', isActivity: false, weight: 5 },
    { code: 'HO_SALES_VALUE', name: 'Sales Value', dimension: 'COMMERCIAL', metricKey: 'horeca.sales_value', unit: 'IDR', isActivity: false, weight: 10 },
    { code: 'HO_REPEAT_ORDER', name: 'Repeat Order', dimension: 'COMMERCIAL', metricKey: 'horeca.repeat_order_outlets', unit: 'outlets', isActivity: false, weight: 5 },
    { code: 'HO_POSM_COMPLIANCE', name: 'POSM Compliance', dimension: 'EXECUTION', metricKey: 'horeca.posm_compliance_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'HO_PROGRAM_EXECUTION', name: 'Program Execution', dimension: 'EXECUTION', metricKey: 'horeca.program_execution_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'HO_COMPETITOR_INTEL', name: 'Competitor Intelligence Coverage', dimension: 'INTELLIGENCE', metricKey: 'intel.competitor_coverage_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'HO_DATA_ACCURACY', name: 'Reporting Accuracy', dimension: 'DATA_QUALITY', metricKey: 'data.validation_pass_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'HO_REPORTING_COMPLIANCE', name: 'Reporting Compliance', dimension: 'REPORTING_COMPLIANCE', metricKey: 'reports.compliance_pct', unit: '%', isActivity: true, weight: 10 },
  ],
  REGULER: [
    { code: 'RG_VISIT_COMPLIANCE', name: 'Visit Compliance', dimension: 'PRODUCTIVITY', metricKey: 'visits.plan_compliance_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'RG_PRODUCTIVE_VISIT', name: 'Productive Visit', dimension: 'PRODUCTIVITY', metricKey: 'regular.productive_visit_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'RG_OUTLET_COVERAGE', name: 'Outlet Coverage', dimension: 'COVERAGE', metricKey: 'outlets.coverage_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'RG_AVAILABILITY', name: 'Availability', dimension: 'COVERAGE', metricKey: 'regular.availability_pct', unit: '%', isActivity: false, weight: 5 },
    { code: 'RG_SKU_PENETRATION', name: 'SKU Penetration', dimension: 'COVERAGE', metricKey: 'regular.sku_penetration_pct', unit: '%', isActivity: false, weight: 5 },
    { code: 'RG_SALES_VALUE', name: 'Sales Value', dimension: 'COMMERCIAL', metricKey: 'regular.sales_value', unit: 'IDR', isActivity: false, weight: 10 },
    { code: 'RG_SALES_VOLUME', name: 'Sales Volume', dimension: 'COMMERCIAL', metricKey: 'regular.sales_volume', unit: 'qty', isActivity: false, weight: 5 },
    { code: 'RG_ORDER_CONVERSION', name: 'Order Conversion', dimension: 'COMMERCIAL', metricKey: 'regular.order_conversion_pct', unit: '%', isActivity: false, weight: 5 },
    { code: 'RG_SHARE_OF_SHELF', name: 'Share of Shelf', dimension: 'COMMERCIAL', metricKey: 'regular.share_of_shelf_pct', unit: '%', isActivity: false, weight: 5 },
    { code: 'RG_POSM_COMPLIANCE', name: 'POSM Compliance', dimension: 'EXECUTION', metricKey: 'regular.posm_compliance_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'RG_COMPETITOR_INTEL', name: 'Competitor Intelligence', dimension: 'INTELLIGENCE', metricKey: 'intel.competitor_coverage_pct', unit: '%', isActivity: true, weight: 5 },
    { code: 'RG_DATA_ACCURACY', name: 'Reporting Accuracy', dimension: 'DATA_QUALITY', metricKey: 'data.validation_pass_pct', unit: '%', isActivity: true, weight: 10 },
    { code: 'RG_REPORTING_COMPLIANCE', name: 'Reporting Compliance', dimension: 'REPORTING_COMPLIANCE', metricKey: 'reports.compliance_pct', unit: '%', isActivity: true, weight: 10 },
  ],
};

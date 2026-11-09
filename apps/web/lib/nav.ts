import { PERMISSIONS as P, type PermissionCode } from '@tanda/shared';
import { LayoutDashboard, Users, Warehouse, UtensilsCrossed, Store, MapPinned, Building2, Radar, Target, FileBarChart, ShieldCheck, UserCog, PlugZap, Settings, ClipboardCheck, ScrollText } from 'lucide-react';

export interface NavItem { label: string; href: string; icon: React.ElementType; any: PermissionCode[]; children?: { label: string; href: string; any: PermissionCode[] }[] }

/** Main navigation (brief §O). Each item is shown only when the user holds one of `any`. */
export const NAV: NavItem[] = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard, any: [P.DASHBOARD_READ], children: [
    { label: 'Executive', href: '/overview', any: [P.DASHBOARD_READ] },
    { label: 'Operational', href: '/overview/operational', any: [P.VISIT_READ] },
    { label: 'Drill-down', href: '/overview/drilldown', any: [P.DASHBOARD_READ] },
  ] },
  { label: 'SPG Management', href: '/spgs', icon: Users, any: [P.SPG_READ] },
  { label: 'SPG Grosir', href: '/grosir', icon: Warehouse, any: [P.TRANSACTION_READ, P.INTEL_READ], children: [
    { label: 'Retailer transactions', href: '/grosir', any: [P.TRANSACTION_READ] },
    { label: 'Wholesalers', href: '/grosir/wholesalers', any: [P.INTEL_READ] },
    { label: 'Retailers', href: '/grosir/retailers', any: [P.OUTLET_READ] },
  ] },
  { label: 'SPG HORECA', href: '/horeca', icon: UtensilsCrossed, any: [P.TRANSACTION_READ, P.INTEL_READ], children: [
    { label: 'Sales', href: '/horeca', any: [P.TRANSACTION_READ] },
    { label: 'Programs', href: '/horeca/programs', any: [P.INTEL_READ] },
  ] },
  { label: 'SPG Reguler', href: '/reguler', icon: Store, any: [P.TRANSACTION_READ], children: [
    { label: 'Orders', href: '/reguler', any: [P.TRANSACTION_READ] },
    { label: 'Availability', href: '/reguler/availability', any: [P.TRANSACTION_READ] },
    { label: 'Visibility', href: '/reguler/visibility', any: [P.TRANSACTION_READ] },
  ] },
  { label: 'Attendance & Visits', href: '/attendance', icon: MapPinned, any: [P.ATTENDANCE_READ, P.VISIT_READ], children: [
    { label: 'Attendance', href: '/attendance', any: [P.ATTENDANCE_READ] },
    { label: 'Visits', href: '/attendance/visits', any: [P.VISIT_READ] },
    { label: 'Visit plans', href: '/attendance/plans', any: [P.VISIT_PLAN_MANAGE] },
    { label: 'Daily reports', href: '/attendance/reports', any: [P.REPORT_READ] },
  ] },
  { label: 'Outlet Management', href: '/outlets', icon: Building2, any: [P.OUTLET_READ, P.PRODUCT_READ], children: [
    { label: 'Outlets', href: '/outlets', any: [P.OUTLET_READ] },
    { label: 'Products & competitors', href: '/outlets/products', any: [P.PRODUCT_READ] },
    { label: 'Organization', href: '/outlets/organization', any: [P.ORG_READ] },
  ] },
  { label: 'Market Intelligence', href: '/market', icon: Radar, any: [P.INTEL_READ], children: [
    { label: 'Dashboard', href: '/market', any: [P.INTEL_READ] },
    { label: 'Competitor observations', href: '/market/observations', any: [P.INTEL_READ] },
  ] },
  { label: 'KPI & Performance', href: '/performance', icon: Target, any: [P.PERFORMANCE_READ, P.KPI_READ], children: [
    { label: 'Ranking', href: '/performance', any: [P.PERFORMANCE_READ] },
    { label: 'KPI configuration', href: '/performance/kpi', any: [P.KPI_READ] },
    { label: 'Targets', href: '/performance/targets', any: [P.KPI_READ] },
  ] },
  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, any: [P.TRANSACTION_APPROVE, P.APPROVAL_READ] },
  { label: 'Reports & Analytics', href: '/reports', icon: FileBarChart, any: [P.DASHBOARD_READ] },
  { label: 'Data Quality', href: '/data-quality', icon: ShieldCheck, any: [P.DATA_QUALITY_READ] },
  { label: 'User Management', href: '/users', icon: UserCog, any: [P.USERS_READ] },
  { label: 'Integrations', href: '/integrations', icon: PlugZap, any: [P.INTEGRATION_READ, P.OCR_REVIEW], children: [
    { label: 'OCR review', href: '/integrations', any: [P.OCR_REVIEW] },
    { label: 'Google Drive & Sheets', href: '/integrations/google', any: [P.INTEGRATION_READ] },
  ] },
  { label: 'Audit Trail', href: '/audit', icon: ScrollText, any: [P.AUDIT_READ] },
  { label: 'System Settings', href: '/settings', icon: Settings, any: [P.SETTINGS_MANAGE, P.KPI_READ] },
];

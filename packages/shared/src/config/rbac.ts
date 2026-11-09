/**
 * RBAC catalogue. Source of truth for seeding `roles`, `permissions`, `role_permissions`.
 * Data *scope* (which rows) is resolved separately by the API ScopeService (ADR D5).
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  NATIONAL_MANAGER: 'NATIONAL_MANAGER',
  REGIONAL_MANAGER: 'REGIONAL_MANAGER',
  AREA_MANAGER: 'AREA_MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  BUSINESS_ANALYST: 'BUSINESS_ANALYST',
  VIEWER: 'VIEWER',
  SPG_GROSIR: 'SPG_GROSIR',
  SPG_HORECA: 'SPG_HORECA',
  SPG_REGULER: 'SPG_REGULER',
} as const;
export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const SPG_ROLES: RoleCode[] = [ROLES.SPG_GROSIR, ROLES.SPG_HORECA, ROLES.SPG_REGULER];
export const MANAGEMENT_ROLES: RoleCode[] = [
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.NATIONAL_MANAGER, ROLES.REGIONAL_MANAGER,
  ROLES.AREA_MANAGER, ROLES.SUPERVISOR, ROLES.BUSINESS_ANALYST, ROLES.VIEWER,
];

export const PERMISSIONS = {
  // users & security
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  // organisation & master data
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
  SPG_READ: 'spg.read',
  SPG_MANAGE: 'spg.manage',
  OUTLET_READ: 'outlet.read',
  OUTLET_MANAGE: 'outlet.manage',
  OUTLET_CREATE_FIELD: 'outlet.create_field',
  PRODUCT_READ: 'product.read',
  PRODUCT_MANAGE: 'product.manage',
  // field operations
  ATTENDANCE_SELF: 'attendance.self',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_OVERRIDE: 'attendance.override',
  VISIT_SELF: 'visit.self',
  VISIT_READ: 'visit.read',
  VISIT_PLAN_MANAGE: 'visit_plan.manage',
  REPORT_SELF: 'report.self',
  REPORT_READ: 'report.read',
  REPORT_REVIEW: 'report.review',
  FILE_UPLOAD: 'file.upload',
  // business modules
  WHOLESALE_SUBMIT: 'wholesale.submit',
  HORECA_SUBMIT: 'horeca.submit',
  REGULAR_SUBMIT: 'regular.submit',
  TRANSACTION_READ: 'transaction.read',
  TRANSACTION_APPROVE: 'transaction.approve',
  TRANSACTION_CORRECT: 'transaction.correct',
  PROGRAM_MANAGE: 'program.manage',
  INTEL_READ: 'intel.read',
  // KPI
  KPI_READ: 'kpi.read',
  KPI_MANAGE: 'kpi.manage',
  TARGET_MANAGE: 'target.manage',
  PERFORMANCE_READ: 'performance.read',
  PERFORMANCE_RECALCULATE: 'performance.recalculate',
  PERFORMANCE_SELF: 'performance.self',
  // analytics & reporting
  DASHBOARD_READ: 'dashboard.read',
  REPORT_EXPORT: 'report.export',
  DATA_QUALITY_READ: 'data_quality.read',
  DATA_QUALITY_MANAGE: 'data_quality.manage',
  APPROVAL_READ: 'approval.read',
  APPROVAL_DECIDE: 'approval.decide',
  // OCR / integrations
  OCR_REVIEW: 'ocr.review',
  OCR_APPROVE: 'ocr.approve',
  INTEGRATION_READ: 'integration.read',
  INTEGRATION_MANAGE: 'integration.manage',
  NOTIFICATION_SELF: 'notification.self',
} as const;
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const ALL = Object.values(P) as PermissionCode[];
const READ_ANALYTICS: PermissionCode[] = [
  P.ORG_READ, P.SPG_READ, P.OUTLET_READ, P.PRODUCT_READ, P.ATTENDANCE_READ, P.VISIT_READ,
  P.REPORT_READ, P.TRANSACTION_READ, P.INTEL_READ, P.KPI_READ, P.PERFORMANCE_READ,
  P.DASHBOARD_READ, P.DATA_QUALITY_READ, P.APPROVAL_READ, P.NOTIFICATION_SELF,
];
const LINE_MANAGER: PermissionCode[] = [
  ...READ_ANALYTICS, P.REPORT_EXPORT, P.REPORT_REVIEW, P.TRANSACTION_APPROVE, P.TRANSACTION_CORRECT,
  P.APPROVAL_DECIDE, P.ATTENDANCE_OVERRIDE, P.VISIT_PLAN_MANAGE, P.OCR_REVIEW, P.OCR_APPROVE,
  P.DATA_QUALITY_MANAGE, P.FILE_UPLOAD,
];
const SPG_BASE: PermissionCode[] = [
  P.ATTENDANCE_SELF, P.VISIT_SELF, P.REPORT_SELF, P.FILE_UPLOAD, P.OUTLET_READ, P.PRODUCT_READ,
  P.PERFORMANCE_SELF, P.NOTIFICATION_SELF, P.TRANSACTION_CORRECT,
];

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== P.ROLES_MANAGE),
  NATIONAL_MANAGER: [...LINE_MANAGER, P.KPI_MANAGE, P.TARGET_MANAGE, P.PERFORMANCE_RECALCULATE, P.PROGRAM_MANAGE, P.INTEGRATION_READ, P.AUDIT_READ],
  REGIONAL_MANAGER: [...LINE_MANAGER, P.TARGET_MANAGE, P.PROGRAM_MANAGE],
  AREA_MANAGER: [...LINE_MANAGER, P.OUTLET_MANAGE, P.PROGRAM_MANAGE],
  SUPERVISOR: [...LINE_MANAGER],
  BUSINESS_ANALYST: [...READ_ANALYTICS, P.REPORT_EXPORT, P.INTEGRATION_READ],
  VIEWER: [P.DASHBOARD_READ, P.KPI_READ, P.PERFORMANCE_READ, P.ORG_READ, P.NOTIFICATION_SELF],
  SPG_GROSIR: [...SPG_BASE, P.WHOLESALE_SUBMIT, P.OUTLET_CREATE_FIELD],
  SPG_HORECA: [...SPG_BASE, P.HORECA_SUBMIT],
  SPG_REGULER: [...SPG_BASE, P.REGULAR_SUBMIT],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', NATIONAL_MANAGER: 'National Manager',
  REGIONAL_MANAGER: 'Regional Manager', AREA_MANAGER: 'Area Manager', SUPERVISOR: 'Supervisor',
  BUSINESS_ANALYST: 'Business Analyst', VIEWER: 'Viewer', SPG_GROSIR: 'SPG Grosir',
  SPG_HORECA: 'SPG HORECA', SPG_REGULER: 'SPG Reguler',
};

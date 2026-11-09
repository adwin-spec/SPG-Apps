/** Modules added phase by phase (keeps app.module stable). */
import { FilesModule } from './files/files.module';
import { AttendanceModule } from './attendance/attendance.module';
import { VisitsModule } from './visits/visits.module';
import { DailyReportsModule } from './daily-reports/daily-reports.module';
import { FieldModule } from './field/field.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CompetitorsModule } from './competitors/competitors.module';
import { WholesaleModule } from './wholesale/wholesale.module';
import { HorecaModule } from './horeca/horeca.module';
import { RegularModule } from './regular/regular.module';
import { ReviewModule } from './review/review.module';
import { KpiModule } from './kpi/kpi.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { QueueModule } from './queue/queue.module';
import { OcrModule } from './ocr/ocr.module';
import { MaintenanceModule } from './queue/maintenance.module';

export const FEATURE_MODULES = [
  // Phase 2 – field operations
  FilesModule, AttendanceModule, VisitsModule, DailyReportsModule, FieldModule,
  // Phase 3 – business modules
  ApprovalsModule, TransactionsModule, CompetitorsModule, WholesaleModule, HorecaModule, RegularModule, ReviewModule,
  // Phase 4 – KPI engine
  KpiModule,
  // Phase 5 – BI, reporting, data quality, notifications
  AnalyticsModule, DataQualityModule, NotificationsModule, SettingsModule,
  // Phase 6 – OCR & Google integration
  QueueModule, OcrModule, MaintenanceModule,
];

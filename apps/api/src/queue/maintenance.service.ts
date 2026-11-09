import { Injectable, OnModuleInit } from '@nestjs/common';
import { jakartaDate } from '@tanda/shared';
import { QueueService } from './queue.service';
import { KpiEngineService } from '../kpi/kpi-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DataQualityService } from '../data-quality/data-quality.service';
import { VisitsService } from '../visits/visits.service';

/** Scheduled maintenance jobs (executed by the worker; callable inline in tests). */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  constructor(private readonly queue: QueueService, private readonly kpi: KpiEngineService, private readonly notifications: NotificationsService,
    private readonly dq: DataQualityService, private readonly visits: VisitsService) {}

  onModuleInit() {
    this.queue.register('maintenance', 'kpi-recalc', async () => {
      const cur = jakartaDate().slice(0, 7);
      const d = new Date(`${cur}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
      const prev = d.toISOString().slice(0, 7);
      const r = [await this.kpi.recalculate(prev), await this.kpi.recalculate(cur)];
      await this.notifications.performanceAlerts(cur);
      return r;
    });
    this.queue.register('maintenance', 'mark-missed-plans', async () => this.visits.markMissedPlans());
    this.queue.register('maintenance', 'notifications-scan', async () => this.notifications.scan());
    this.queue.register('maintenance', 'dq-scan', async () => this.dq.scan());
  }
}

import { Global, Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FilterService } from './filter.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';

@Global()
@Module({ controllers: [AnalyticsController, ReportsController], providers: [AnalyticsService, FilterService, ReportsService], exports: [FilterService, AnalyticsService] })
export class AnalyticsModule {}

import { Global, Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiConfigService } from './kpi-config.service';
import { KpiEngineService } from './kpi-engine.service';
import { PerformanceController } from '../performance/performance.controller';
import { PerformanceService } from '../performance/performance.service';

@Global()
@Module({ controllers: [KpiController, PerformanceController], providers: [KpiConfigService, KpiEngineService, PerformanceService], exports: [KpiEngineService, PerformanceService] })
export class KpiModule {}

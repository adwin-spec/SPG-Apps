import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { VisitsModule } from '../visits/visits.module';
@Module({ imports: [VisitsModule], providers: [MaintenanceService], exports: [MaintenanceService] })
export class MaintenanceModule {}

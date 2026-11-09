import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { AuditController } from '../audit/audit.controller';
@Module({ controllers: [SettingsController, AuditController] })
export class SettingsModule {}

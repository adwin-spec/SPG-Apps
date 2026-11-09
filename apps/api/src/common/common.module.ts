import { Global, Module } from '@nestjs/common';
import { FieldRecordsService } from './field-records.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { ScopeService } from './scope/scope.service';
import { AuditService } from './audit/audit.service';
import { SettingsService } from './settings/settings.service';
import { StorageService } from './storage/storage.service';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';

@Global()
@Module({
  providers: [PrismaService, RedisService, ScopeService, AuditService, SettingsService, StorageService, RedisThrottlerStorage, FieldRecordsService],
  exports: [PrismaService, RedisService, ScopeService, AuditService, SettingsService, StorageService, RedisThrottlerStorage, FieldRecordsService],
})
export class CommonModule {}

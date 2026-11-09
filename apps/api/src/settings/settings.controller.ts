import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, settingUpdateSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { AuditService } from '../common/audit/audit.service';

const typeOf = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly audit: AuditService) {}

  @Get() @RequirePermissions(PERMISSIONS.KPI_READ)
  list() { return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }); }

  @Put(':key') @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE) @ApiZodBody(settingUpdateSchema)
  async update(@Param('key') key: string, @Body(new ZodPipe(settingUpdateSchema)) b: z.infer<typeof settingUpdateSchema>, @CurrentUser() u: AuthUser) {
    const current = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!current) throw new BadRequestException({ code: 'UNKNOWN_SETTING', message: `Unknown setting ${key}` });
    if (typeOf(current.value) !== typeOf(b.value)) throw new BadRequestException({ code: 'SETTING_TYPE_MISMATCH', message: `Expected ${typeOf(current.value)}` });
    const updated = await this.prisma.systemSetting.update({ where: { key }, data: { value: b.value as object, updatedById: u.id, isSimulationDefault: b.confirmProductionValue ? false : current.isSimulationDefault } });
    await this.settings.invalidate(key);
    await this.audit.log({ actorId: u.id, action: 'UPDATE_SETTING', entityType: 'SystemSetting', entityId: key, before: current.value, after: b.value });
    return updated;
  }
}

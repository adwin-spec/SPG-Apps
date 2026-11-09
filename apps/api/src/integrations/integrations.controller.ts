import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, type AuthUser } from '@tanda/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { IntegrationsService, jobQuery } from './integrations.service';

@ApiTags('Integrations (Google Drive / Sheets)')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get('status') @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  status() { return this.svc.status(); }

  @Post('drive/sync') @HttpCode(202) @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  drive(@CurrentUser() u: AuthUser) { return this.svc.trigger(u, 'drive-sync'); }

  @Post('sheets/sync') @HttpCode(202) @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  sheets(@CurrentUser() u: AuthUser) { return this.svc.trigger(u, 'sheets-sync'); }

  @Get('sync-jobs') @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  jobs(@Query(new ZodPipe(jobQuery)) q: z.infer<typeof jobQuery>) { return this.svc.jobs(q); }

  @Get('logs') @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  logs() { return this.svc.logs(); }
}

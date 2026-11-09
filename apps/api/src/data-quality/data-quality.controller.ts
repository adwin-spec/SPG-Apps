import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, analyticsFilter, dqIssueUpdateSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { DataQualityService, dqIssueQuery } from './data-quality.service';

@ApiTags('Data Quality')
@ApiBearerAuth()
@Controller('data-quality')
export class DataQualityController {
  constructor(private readonly svc: DataQualityService) {}

  @Get('summary') @RequirePermissions(PERMISSIONS.DATA_QUALITY_READ)
  summary(@CurrentUser() u: AuthUser, @Query(new ZodPipe(analyticsFilter)) f: z.infer<typeof analyticsFilter>) { return this.svc.summary(u, f); }

  @Get('issues') @RequirePermissions(PERMISSIONS.DATA_QUALITY_READ)
  issues(@CurrentUser() u: AuthUser, @Query(new ZodPipe(dqIssueQuery)) q: z.infer<typeof dqIssueQuery>) { return this.svc.issues(u, q); }

  @Patch('issues/:id') @RequirePermissions(PERMISSIONS.DATA_QUALITY_MANAGE) @ApiZodBody(dqIssueUpdateSchema)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(dqIssueUpdateSchema)) b: z.infer<typeof dqIssueUpdateSchema>) { return this.svc.updateIssue(u, id, b.status, b.note); }

  @Post('scan') @HttpCode(200) @RequirePermissions(PERMISSIONS.DATA_QUALITY_MANAGE)
  scan() { return this.svc.scan(); }
}

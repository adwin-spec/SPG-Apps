import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, analyticsFilter, isoDate, type AuthUser } from '@tanda/shared';
import { ApiZodQuery, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { AnalyticsService } from './analytics.service';

const drillQuery = analyticsFilter.extend({ level: z.enum(['region', 'area', 'district', 'subdistrict', 'spg', 'outlet']) });
const opsQuery = analyticsFilter.extend({ date: isoDate.optional() });

@ApiTags('Analytics & Dashboards')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('executive') @RequirePermissions(PERMISSIONS.DASHBOARD_READ) @ApiZodQuery(analyticsFilter)
  executive(@CurrentUser() u: AuthUser, @Query(new ZodPipe(analyticsFilter)) f: z.infer<typeof analyticsFilter>) { return this.svc.executive(u, f); }

  @Get('drilldown') @RequirePermissions(PERMISSIONS.DASHBOARD_READ) @ApiZodQuery(drillQuery)
  drilldown(@CurrentUser() u: AuthUser, @Query(new ZodPipe(drillQuery)) f: z.infer<typeof drillQuery>) { return this.svc.drilldown(u, f); }

  @Get('market') @RequirePermissions(PERMISSIONS.INTEL_READ) @ApiZodQuery(analyticsFilter)
  market(@CurrentUser() u: AuthUser, @Query(new ZodPipe(analyticsFilter)) f: z.infer<typeof analyticsFilter>) { return this.svc.market(u, f); }

  @Get('operational') @RequirePermissions(PERMISSIONS.DASHBOARD_READ, PERMISSIONS.VISIT_READ) @ApiZodQuery(opsQuery)
  operational(@CurrentUser() u: AuthUser, @Query(new ZodPipe(opsQuery)) f: z.infer<typeof opsQuery>) { return this.svc.operational(u, f); }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, isoMonth, jakartaDate, recalcSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { requireSpg } from '../common/field-guard';
import { KpiEngineService } from '../kpi/kpi-engine.service';
import { PerformanceService, perfListQuery } from './performance.service';

const periodQ = z.object({ period: isoMonth.optional() });
const lockSchema = z.object({ period: isoMonth, category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional() });

@ApiTags('KPI & Performance')
@ApiBearerAuth()
@Controller('performance')
export class PerformanceController {
  constructor(private readonly svc: PerformanceService, private readonly engine: KpiEngineService) {}

  @Get() @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(perfListQuery)) q: z.infer<typeof perfListQuery>) { return this.svc.list(u, q); }

  @Get('me') @RequirePermissions(PERMISSIONS.PERFORMANCE_SELF)
  me(@CurrentUser() u: AuthUser, @Query(new ZodPipe(periodQ)) q: z.infer<typeof periodQ>) { return this.svc.detail(u, requireSpg(u), q.period ?? jakartaDate().slice(0, 7)); }

  @Get('spgs/:id') @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(periodQ)) q: z.infer<typeof periodQ>) { return this.svc.detail(u, id, q.period ?? jakartaDate().slice(0, 7)); }

  @Post('recalculate') @HttpCode(200) @RequirePermissions(PERMISSIONS.PERFORMANCE_RECALCULATE) @ApiZodBody(recalcSchema)
  recalc(@Body(new ZodPipe(recalcSchema)) b: z.infer<typeof recalcSchema>) { return this.engine.recalculate(b.period, { category: b.category, spgId: b.spgId }); }

  @Post('lock') @HttpCode(200) @RequirePermissions(PERMISSIONS.PERFORMANCE_RECALCULATE) @ApiZodBody(lockSchema)
  lock(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lockSchema)) b: z.infer<typeof lockSchema>) { return this.svc.lock(u, b.period, b.category); }
}

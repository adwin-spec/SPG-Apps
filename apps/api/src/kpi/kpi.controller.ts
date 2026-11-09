import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, METRIC_CATALOG, isoMonth, kpiDefinitionCreateSchema, kpiDefinitionUpdateSchema, kpiFormulaVersionSchema, kpiWeightChangeSchema, targetBulkSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { KpiConfigService } from './kpi-config.service';

const catQuery = z.object({ category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional() });
const targetQuery = catQuery.extend({ period: isoMonth });

@ApiTags('KPI Configuration')
@ApiBearerAuth()
@Controller('kpi')
export class KpiController {
  constructor(private readonly svc: KpiConfigService) {}

  @Get('metrics') @RequirePermissions(PERMISSIONS.KPI_READ)
  metrics() { return METRIC_CATALOG; }

  @Get('definitions') @RequirePermissions(PERMISSIONS.KPI_READ)
  list(@Query(new ZodPipe(catQuery)) q: z.infer<typeof catQuery>) { return this.svc.list(q.category); }

  @Post('definitions') @RequirePermissions(PERMISSIONS.KPI_MANAGE) @ApiZodBody(kpiDefinitionCreateSchema)
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(kpiDefinitionCreateSchema)) b: z.infer<typeof kpiDefinitionCreateSchema>) { return this.svc.create(u, b); }

  @Patch('definitions/:id') @RequirePermissions(PERMISSIONS.KPI_MANAGE) @ApiZodBody(kpiDefinitionUpdateSchema)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(kpiDefinitionUpdateSchema)) b: z.infer<typeof kpiDefinitionUpdateSchema>) { return this.svc.update(u, id, b); }

  @Post('definitions/:id/formulas') @RequirePermissions(PERMISSIONS.KPI_MANAGE) @ApiZodBody(kpiFormulaVersionSchema)
  formula(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(kpiFormulaVersionSchema)) b: z.infer<typeof kpiFormulaVersionSchema>) { return this.svc.newFormulaVersion(u, id, b); }

  @Post('definitions/:id/weights') @RequirePermissions(PERMISSIONS.KPI_MANAGE) @ApiZodBody(kpiWeightChangeSchema)
  weight(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(kpiWeightChangeSchema)) b: z.infer<typeof kpiWeightChangeSchema>) { return this.svc.changeWeight(u, id, b); }

  @Get('definitions/:id/history') @RequirePermissions(PERMISSIONS.KPI_READ)
  history(@Param('id', ParseUUIDPipe) id: string) { return this.svc.history(id); }

  @Get('targets') @RequirePermissions(PERMISSIONS.KPI_READ)
  targets(@Query(new ZodPipe(targetQuery)) q: z.infer<typeof targetQuery>) { return this.svc.targets(q.period, q.category); }

  @Put('targets') @RequirePermissions(PERMISSIONS.TARGET_MANAGE) @ApiZodBody(targetBulkSchema)
  upsertTargets(@CurrentUser() u: AuthUser, @Body(new ZodPipe(targetBulkSchema)) b: z.infer<typeof targetBulkSchema>) { return this.svc.upsertTargets(u, b.items); }
}

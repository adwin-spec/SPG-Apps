import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, wholesaleObservationSchema, wholesaleReportSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { WholesaleService, periodQuery } from './wholesale.service';

@ApiTags('SPG Grosir – Wholesale')
@ApiBearerAuth()
@Controller('wholesale')
export class WholesaleController {
  constructor(private readonly svc: WholesaleService) {}

  @Post('observations') @RequirePermissions(PERMISSIONS.WHOLESALE_SUBMIT) @ApiZodBody(wholesaleObservationSchema)
  observe(@CurrentUser() u: AuthUser, @Body(new ZodPipe(wholesaleObservationSchema)) b: z.infer<typeof wholesaleObservationSchema>) { return this.svc.observe(u, b); }

  @Post('reports') @RequirePermissions(PERMISSIONS.WHOLESALE_SUBMIT) @ApiZodBody(wholesaleReportSchema)
  report(@CurrentUser() u: AuthUser, @Body(new ZodPipe(wholesaleReportSchema)) b: z.infer<typeof wholesaleReportSchema>) { return this.svc.report(u, b); }

  @Get('wholesalers/:id/intelligence') @RequireAnyPermission(PERMISSIONS.INTEL_READ, PERMISSIONS.WHOLESALE_SUBMIT)
  intelligence(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(periodQuery)) q: z.infer<typeof periodQuery>) { return this.svc.intelligence(u, id, q); }

  @Get('retailers/:id/history') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.WHOLESALE_SUBMIT)
  history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.retailerHistory(u, id); }
}

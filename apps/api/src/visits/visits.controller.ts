import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, visitCheckInSchema, visitCheckOutSchema, visitEvidenceSchema, visitOverrideSchema, visitPlanSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { VisitsService, planListQuery, visitListQuery } from './visits.service';

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

@ApiTags('Visits')
@ApiBearerAuth()
@Controller()
export class VisitsController {
  constructor(private readonly svc: VisitsService) {}

  @Post('visits/check-in') @RequirePermissions(PERMISSIONS.VISIT_SELF) @ApiZodBody(visitCheckInSchema)
  checkIn(@CurrentUser() u: AuthUser, @Body(new ZodPipe(visitCheckInSchema)) b: z.infer<typeof visitCheckInSchema>) { return this.svc.checkIn(u, b); }

  @Post('visits/:id/check-out') @HttpCode(200) @RequirePermissions(PERMISSIONS.VISIT_SELF) @ApiZodBody(visitCheckOutSchema)
  checkOut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(visitCheckOutSchema)) b: z.infer<typeof visitCheckOutSchema>) { return this.svc.checkOut(u, id, b); }

  @Post('visits/:id/evidence') @RequirePermissions(PERMISSIONS.VISIT_SELF) @ApiZodBody(visitEvidenceSchema)
  evidence(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(visitEvidenceSchema)) b: z.infer<typeof visitEvidenceSchema>) { return this.svc.addEvidence(u, id, b); }

  @Get('visits') @RequireAnyPermission(PERMISSIONS.VISIT_READ, PERMISSIONS.VISIT_SELF)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(visitListQuery)) q: z.infer<typeof visitListQuery>) {
    if (!u.permissions.includes(PERMISSIONS.VISIT_READ)) q.mine = 'true';
    return this.svc.list(u, q);
  }

  @Get('visits/:id') @RequireAnyPermission(PERMISSIONS.VISIT_READ, PERMISSIONS.VISIT_SELF)
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post('visits/:id/override') @RequirePermissions(PERMISSIONS.ATTENDANCE_OVERRIDE) @ApiZodBody(visitOverrideSchema)
  override(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(visitOverrideSchema)) b: z.infer<typeof visitOverrideSchema>) { return this.svc.override(u, id, b); }

  @Get('visit-plans') @RequireAnyPermission(PERMISSIONS.VISIT_READ, PERMISSIONS.VISIT_SELF)
  plans(@CurrentUser() u: AuthUser, @Query(new ZodPipe(planListQuery)) q: z.infer<typeof planListQuery>) { return this.svc.plans(u, q); }

  @Post('visit-plans') @RequirePermissions(PERMISSIONS.VISIT_PLAN_MANAGE) @ApiZodBody(visitPlanSchema)
  createPlans(@CurrentUser() u: AuthUser, @Body(new ZodPipe(visitPlanSchema)) b: z.infer<typeof visitPlanSchema>) { return this.svc.createPlans(u, b); }

  @Post('visit-plans/:id/cancel') @HttpCode(200) @RequirePermissions(PERMISSIONS.VISIT_PLAN_MANAGE) @ApiZodBody(reasonSchema)
  cancelPlan(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reasonSchema)) b: z.infer<typeof reasonSchema>) { return this.svc.cancelPlan(u, id, b.reason); }
}

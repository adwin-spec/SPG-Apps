import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, approvalDecisionSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { ApprovalsService, approvalListQuery } from './approvals.service';

@ApiTags('Approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @Get() @RequirePermissions(PERMISSIONS.APPROVAL_READ)
  list(@Query(new ZodPipe(approvalListQuery)) q: z.infer<typeof approvalListQuery>) { return this.svc.list(q); }

  @Post(':id/decision') @HttpCode(200) @RequirePermissions(PERMISSIONS.APPROVAL_DECIDE) @ApiZodBody(approvalDecisionSchema)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(approvalDecisionSchema)) b: z.infer<typeof approvalDecisionSchema>) { return this.svc.decide(u, id, b.decision, b.note); }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, dailyReportSchema, reportReviewSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { DailyReportsService, reportListQuery } from './daily-reports.service';

@ApiTags('Daily Reports')
@ApiBearerAuth()
@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly svc: DailyReportsService) {}

  @Post() @RequirePermissions(PERMISSIONS.REPORT_SELF) @ApiZodBody(dailyReportSchema)
  upsert(@CurrentUser() u: AuthUser, @Body(new ZodPipe(dailyReportSchema)) b: z.infer<typeof dailyReportSchema>) { return this.svc.upsert(u, b); }

  @Get() @RequireAnyPermission(PERMISSIONS.REPORT_READ, PERMISSIONS.REPORT_SELF)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(reportListQuery)) q: z.infer<typeof reportListQuery>) {
    if (!u.permissions.includes(PERMISSIONS.REPORT_READ)) q.mine = 'true';
    return this.svc.list(u, q);
  }

  @Post(':id/review') @HttpCode(200) @RequirePermissions(PERMISSIONS.REPORT_REVIEW) @ApiZodBody(reportReviewSchema)
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reportReviewSchema)) b: z.infer<typeof reportReviewSchema>) { return this.svc.review(u, id, b); }
}

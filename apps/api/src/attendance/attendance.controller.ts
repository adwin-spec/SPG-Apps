import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, attendanceCheckInSchema, attendanceCheckOutSchema, attendanceOverrideSchema, isoDate, jakartaDate, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { AttendanceService, attendanceListQuery } from './attendance.service';

const dateQuery = z.object({ date: isoDate.optional() });

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post('check-in') @RequirePermissions(PERMISSIONS.ATTENDANCE_SELF) @ApiZodBody(attendanceCheckInSchema)
  checkIn(@CurrentUser() u: AuthUser, @Body(new ZodPipe(attendanceCheckInSchema)) b: z.infer<typeof attendanceCheckInSchema>) { return this.svc.checkIn(u, b); }

  @Post('check-out') @HttpCode(200) @RequirePermissions(PERMISSIONS.ATTENDANCE_SELF) @ApiZodBody(attendanceCheckOutSchema)
  checkOut(@CurrentUser() u: AuthUser, @Body(new ZodPipe(attendanceCheckOutSchema)) b: z.infer<typeof attendanceCheckOutSchema>) { return this.svc.checkOut(u, b); }

  @Get('today') @RequirePermissions(PERMISSIONS.ATTENDANCE_SELF)
  today(@CurrentUser() u: AuthUser) { return this.svc.today(u); }

  @Get() @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(attendanceListQuery)) q: z.infer<typeof attendanceListQuery>) { return this.svc.list(u, q); }

  @Get('missing') @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  missing(@CurrentUser() u: AuthUser, @Query(new ZodPipe(dateQuery)) q: z.infer<typeof dateQuery>) { return this.svc.missing(u, q.date ?? jakartaDate()); }

  @Post('override') @RequirePermissions(PERMISSIONS.ATTENDANCE_OVERRIDE) @ApiZodBody(attendanceOverrideSchema)
  override(@CurrentUser() u: AuthUser, @Body(new ZodPipe(attendanceOverrideSchema)) b: z.infer<typeof attendanceOverrideSchema>) { return this.svc.override(u, b); }
}

import { randomUUID } from 'crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { attendanceCheckInSchema, attendanceCheckOutSchema, attendanceOverrideSchema, jakartaDate, jakartaLocalToUtc, paginationQuery, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';
import { requireSpg, resolveClientTime } from '../common/field-guard';

export const attendanceListQuery = paginationQuery.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  spgId: z.uuid().optional(), status: z.enum(['CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LEAVE']).optional(),
});

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly settings: SettingsService) {}

  async checkIn(user: AuthUser, input: z.infer<typeof attendanceCheckInSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.attendance.findUnique({ where: { clientId: input.clientId } });
    if (replay) { if (replay.spgId !== spgId) throw new ForbiddenException(); return replay; }
    const { at, workDate, skewed } = resolveClientTime(input.clientRecordedAt, await this.settings.get<number>('sync.maxClientClockSkewMin'));
    const existing = await this.prisma.attendance.findUnique({ where: { spgId_workDate: { spgId, workDate: toDate(workDate) } } });
    if (existing) throw new ConflictException({ code: 'ALREADY_CHECKED_IN', message: `Already checked in for ${workDate}`, details: existing });
    return this.prisma.attendance.create({ data: {
      clientId: input.clientId, spgId, workDate: toDate(workDate), status: 'CHECKED_IN', checkInAt: at,
      checkInLat: input.gps?.lat, checkInLng: input.gps?.lng, checkInAccuracyM: input.gps?.accuracyM ?? null, checkInPhotoId: input.photoFileId,
      clientRecordedAt: input.clientRecordedAt ? new Date(input.clientRecordedAt) : null,
      source: input.clientRecordedAt && Date.now() - new Date(input.clientRecordedAt).getTime() > 5 * 60000 ? 'OFFLINE_SYNC' : 'MANUAL',
      note: [input.note, skewed ? '[device clock skew detected]' : null].filter(Boolean).join(' ') || null,
    } });
  }

  async checkOut(user: AuthUser, input: z.infer<typeof attendanceCheckOutSchema>) {
    const spgId = requireSpg(user);
    const open = await this.prisma.attendance.findFirst({ where: { spgId, status: 'CHECKED_IN' }, orderBy: { workDate: 'desc' } });
    if (!open) throw new NotFoundException({ code: 'NOT_CHECKED_IN', message: 'No open attendance to check out' });
    const { at } = resolveClientTime(input.clientRecordedAt, await this.settings.get<number>('sync.maxClientClockSkewMin'));
    if (open.checkInAt && at < open.checkInAt) throw new UnprocessableEntityException({ code: 'CHECKOUT_BEFORE_CHECKIN', message: 'Check-out time precedes check-in' });
    const inProgress = await this.prisma.visit.count({ where: { spgId, status: 'IN_PROGRESS' } });
    if (inProgress) throw new ConflictException({ code: 'VISIT_IN_PROGRESS', message: 'Check out of your current visit first' });
    return this.prisma.attendance.update({ where: { id: open.id }, data: { status: 'CHECKED_OUT', checkOutAt: at, checkOutLat: input.gps?.lat, checkOutLng: input.gps?.lng, checkOutAccuracyM: input.gps?.accuracyM ?? null } });
  }

  async today(user: AuthUser) {
    const spgId = requireSpg(user);
    return this.prisma.attendance.findUnique({ where: { spgId_workDate: { spgId, workDate: toDate(jakartaDate()) } } });
  }

  async list(user: AuthUser, q: z.infer<typeof attendanceListQuery>) {
    const scoped = await this.scope.spgIdFilter(user);
    const where: Prisma.AttendanceWhereInput = {
      AND: [scoped, q.spgId ? { spgId: q.spgId } : {}, q.status ? { status: q.status } : {},
        q.from || q.to ? { workDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}],
    };
    const start = await this.settings.get<string>('attendance.workStartLocalTime');
    const [items, total] = await Promise.all([
      this.prisma.attendance.findMany({ where, include: { spg: { select: { fullName: true, employeeCode: true, category: { select: { code: true } } } } }, orderBy: [{ workDate: 'desc' }, { checkInAt: 'asc' }], ...pageArgs(q) }),
      this.prisma.attendance.count({ where }),
    ]);
    const enriched = items.map((a) => ({ ...a, isLate: !!a.checkInAt && a.checkInAt > jakartaLocalToUtc(a.workDate.toISOString().slice(0, 10), start) }));
    return new Paginated(enriched, total, q.page, q.pageSize);
  }

  /** Active SPGs (in scope) with no attendance record for the date. */
  async missing(user: AuthUser, date: string) {
    const s = await this.scope.spgScope(user);
    return this.prisma.spg.findMany({
      where: { status: 'ACTIVE', ...(s.all ? {} : { id: { in: s.spgIds } }), attendance: { none: { workDate: toDate(date) } } },
      select: { id: true, fullName: true, employeeCode: true, phone: true, category: { select: { code: true } }, currentSupervisor: { select: { user: { select: { fullName: true } } } } },
      orderBy: { fullName: 'asc' },
    });
  }

  /** Supervisor override with mandatory reason (audited, visible on the operational dashboard). */
  async override(user: AuthUser, input: z.infer<typeof attendanceOverrideSchema>) {
    if (!(await this.scope.canAccessSpg(user, input.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG is outside your scope' });
    const workDate = toDate(input.workDate);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.attendance.findUnique({ where: { spgId_workDate: { spgId: input.spgId, workDate } } });
      const data = { status: input.status, checkInAt: input.checkInAt ? new Date(input.checkInAt) : before?.checkInAt, checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : before?.checkOutAt,
        overrideById: user.id, overrideReason: input.reason };
      const after = before
        ? await tx.attendance.update({ where: { id: before.id }, data })
        : await tx.attendance.create({ data: { ...data, clientId: randomUUID(), spgId: input.spgId, workDate } });
      await this.audit.log({ actorId: user.id, action: 'OVERRIDE', entityType: 'Attendance', entityId: after.id, before, after, reason: input.reason }, tx);
      return after;
    });
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { dailyReportSchema, jakartaLocalToUtc, paginationQuery, reportReviewSchema, round, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';
import { CHANNELS_BY_CATEGORY, requireSpg } from '../common/field-guard';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportListQuery = paginationQuery.extend({ from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'REVISION_REQUIRED', 'APPROVED']).optional(), isLate: z.enum(['true', 'false']).optional(), mine: z.enum(['true', 'false']).optional() });

/** Completeness = share of report fields that are filled (summary + channel content). */
export function completeness(summary: string | null | undefined, content: Record<string, unknown>): number {
  const values = [summary, ...Object.values(content)];
  const filled = values.filter((v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')).length;
  return round((filled / values.length) * 100, 2);
}

@Injectable()
export class DailyReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly settings: SettingsService) {}

  async upsert(user: AuthUser, input: z.infer<typeof dailyReportSchema>) {
    const spgId = requireSpg(user);
    const expected = CHANNELS_BY_CATEGORY[user.spgCategory ?? ''] ?? [];
    if (!expected.includes(input.channel)) throw new ForbiddenException({ code: 'WRONG_REPORT_FORM', message: `SPG ${user.spgCategory} must use its own report form` });
    const reportDate = toDate(input.reportDate);
    const existing = await this.prisma.dailyReport.findUnique({ where: { spgId_reportDate: { spgId, reportDate } } });
    if (existing && ['SUBMITTED', 'APPROVED'].includes(existing.status)) {
      if (existing.clientId === input.clientId) return existing; // idempotent replay
      throw new ConflictException({ code: 'REPORT_LOCKED', message: `Report for ${input.reportDate} is already ${existing.status}` });
    }
    const deadline = jakartaLocalToUtc(input.reportDate, await this.settings.get<string>('reporting.dailyDeadlineLocalTime'));
    const submittedAt = input.submit ? (input.clientRecordedAt ? new Date(Math.min(Date.parse(input.clientRecordedAt), Date.now())) : new Date()) : null;
    const data = {
      channel: input.channel, summary: input.summary, issues: input.issues, content: input.content as Prisma.InputJsonValue,
      status: input.submit ? 'SUBMITTED' as const : 'DRAFT' as const, submittedAt, isLate: !!submittedAt && submittedAt > deadline,
      completenessScore: completeness(input.summary, input.content),
    };
    return existing
      ? this.prisma.dailyReport.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
      : this.prisma.dailyReport.create({ data: { ...data, clientId: input.clientId, spgId, reportDate } });
  }

  async list(user: AuthUser, q: z.infer<typeof reportListQuery>) {
    const scoped = q.mine === 'true' ? { spgId: requireSpg(user) } : await this.scope.spgIdFilter(user);
    const where: Prisma.DailyReportWhereInput = { AND: [scoped, q.spgId ? { spgId: q.spgId } : {}, q.status ? { status: q.status } : {},
      q.isLate ? { isLate: q.isLate === 'true' } : {},
      q.from || q.to ? { reportDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, include: { spg: { select: { fullName: true, employeeCode: true, category: { select: { code: true } } } } }, orderBy: [{ reportDate: 'desc' }], ...pageArgs(q) }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async review(user: AuthUser, id: string, input: z.infer<typeof reportReviewSchema>) {
    const r = await this.prisma.dailyReport.findUnique({ where: { id } });
    if (!r || !(await this.scope.canAccessSpg(user, r.spgId))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report not found' });
    if (r.status !== 'SUBMITTED') throw new ConflictException({ code: 'NOT_SUBMITTED', message: `Report is ${r.status}` });
    if (r.spgId === user.spgId) throw new ForbiddenException({ code: 'SELF_REVIEW', message: 'You cannot review your own report' });
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.dailyReport.update({ where: { id }, data: { status: input.decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote: input.note } });
      await this.audit.log({ actorId: user.id, action: `REVIEW_${input.decision}`, entityType: 'DailyReport', entityId: id, before: { status: r.status }, after: { status: after.status }, reason: input.note }, tx);
      if (input.decision === 'REVISION_REQUIRED') {
        const spg = await tx.spg.findUnique({ where: { id: r.spgId }, select: { userId: true } });
        if (spg?.userId) await tx.notification.create({ data: { userId: spg.userId, type: 'REPORT_REVISION', severity: 'WARNING', title: `Report ${r.reportDate.toISOString().slice(0, 10)} needs revision`, body: input.note, link: '/m/reports' } });
      }
      return after;
    });
  }
}

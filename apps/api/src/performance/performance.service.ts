import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { isoMonth, paginationQuery, periodMonth, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { AuditService } from '../common/audit/audit.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';

export const perfListQuery = paginationQuery.extend({ period: isoMonth, category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional(), areaId: z.uuid().optional(), regionId: z.uuid().optional(),
  supervisorId: z.uuid().optional(), status: z.string().max(20).optional() });

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly audit: AuditService) {}

  /** Ranking table (server-side pagination) for a period. */
  async list(user: AuthUser, q: z.infer<typeof perfListQuery>) {
    const scoped = await this.scope.spgIdFilter(user);
    const where: Prisma.PerformanceSnapshotWhereInput = { periodMonth: toDate(periodMonth(q.period)), ...scoped,
      spg: { ...(q.category ? { category: { code: q.category } } : {}), ...(q.areaId ? { currentAreaId: q.areaId } : {}), ...(q.regionId ? { currentArea: { regionId: q.regionId } } : {}), ...(q.supervisorId ? { currentSupervisorId: q.supervisorId } : {}) },
      ...(q.status ? { performanceStatus: q.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.performanceSnapshot.findMany({ where, include: { spg: { select: { id: true, fullName: true, employeeCode: true, category: { select: { code: true } }, currentArea: { select: { name: true } }, currentSupervisor: { select: { user: { select: { fullName: true } } } } } } },
        orderBy: [{ totalScore: { sort: 'desc', nulls: 'last' } }, { spg: { fullName: 'asc' } }], ...pageArgs(q) }),
      this.prisma.performanceSnapshot.count({ where }),
    ]);
    // previous period for trend arrows
    const prev = new Date(toDate(periodMonth(q.period))); prev.setUTCMonth(prev.getUTCMonth() - 1);
    const prevRows = await this.prisma.performanceSnapshot.findMany({ where: { periodMonth: prev, spgId: { in: items.map((i) => i.spgId) } }, select: { spgId: true, totalScore: true } });
    const prevMap = new Map(prevRows.map((p) => [p.spgId, p.totalScore == null ? null : Number(p.totalScore)]));
    return new Paginated(items.map((i) => ({ ...i, previousScore: prevMap.get(i.spgId) ?? null })), total, q.page, q.pageSize);
  }

  /** KPI breakdown with trace for one SPG + 12-month trend. */
  async detail(user: AuthUser, spgId: string, period: string) {
    if (!(await this.scope.canAccessSpg(user, spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG outside your scope' });
    const pm = toDate(periodMonth(period));
    const [spg, snapshot, results, trend] = await Promise.all([
      this.prisma.spg.findUnique({ where: { id: spgId }, include: { category: true, currentArea: { select: { name: true } }, currentSupervisor: { select: { user: { select: { fullName: true } } } } } }),
      this.prisma.performanceSnapshot.findUnique({ where: { spgId_periodMonth: { spgId, periodMonth: pm } } }),
      this.prisma.performanceResult.findMany({ where: { spgId, periodMonth: pm }, include: { kpiDefinition: { select: { code: true, name: true, dimension: true, unit: true, isActivity: true, displayOrder: true, direction: true } } }, orderBy: { kpiDefinition: { displayOrder: 'asc' } } }),
      this.prisma.performanceSnapshot.findMany({ where: { spgId }, orderBy: { periodMonth: 'asc' }, take: 24, select: { periodMonth: true, totalScore: true, activityScore: true, outcomeScore: true, rankInCategory: true, performanceStatus: true } }),
    ]);
    if (!spg) throw new NotFoundException({ code: 'NOT_FOUND', message: 'SPG not found' });
    const categoryAvg = await this.prisma.performanceSnapshot.aggregate({ where: { periodMonth: pm, spg: { categoryId: spg.categoryId } }, _avg: { totalScore: true }, _count: true });
    return { spg, snapshot, results, trend, categoryAverage: categoryAvg._avg.totalScore == null ? null : Number(categoryAvg._avg.totalScore), categoryCount: categoryAvg._count };
  }

  async lock(user: AuthUser, period: string, category?: string) {
    const pm = toDate(periodMonth(period));
    const r = await this.prisma.performanceSnapshot.updateMany({ where: { periodMonth: pm, isLocked: false, ...(category ? { spg: { category: { code: category as never } } } : {}) }, data: { isLocked: true, lockedById: user.id, lockedAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'LOCK_SNAPSHOTS', entityType: 'PerformanceSnapshot', entityId: null, after: { period, category, count: r.count } });
    return { locked: r.count };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SpgCategoryCode } from '@tanda/database';
import { z } from 'zod';
import { paginationQuery, spgAssignSchema, spgCreateSchema, spgUpdateSchema, ROLES, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService, diff } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { Paginated, pageArgs, orderBy, toDate } from '../common/http/paginated';
import { hashPassword } from '../auth/auth.service';

export const spgListQuery = paginationQuery.extend({
  category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED']).optional(),
  areaId: z.uuid().optional(), regionId: z.uuid().optional(), supervisorId: z.uuid().optional(),
});
const include = {
  category: { select: { code: true, name: true } },
  currentArea: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
  currentSupervisor: { select: { id: true, user: { select: { fullName: true } } } },
  user: { select: { id: true, email: true, isActive: true } },
  _count: { select: { assignedOutlets: true } },
} satisfies Prisma.SpgInclude;
const ROLE_BY_CATEGORY: Record<SpgCategoryCode, string> = { GROSIR: ROLES.SPG_GROSIR, HORECA: ROLES.SPG_HORECA, REGULER: ROLES.SPG_REGULER };

@Injectable()
export class SpgsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  async list(q: z.infer<typeof spgListQuery>, user: AuthUser) {
    const s = await this.scope.spgScope(user);
    const where: Prisma.SpgWhereInput = {
      ...(s.all ? {} : { id: { in: s.spgIds } }),
      ...(q.category ? { category: { code: q.category } } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.areaId ? { currentAreaId: q.areaId } : {}),
      ...(q.regionId ? { currentArea: { regionId: q.regionId } } : {}),
      ...(q.supervisorId ? { currentSupervisorId: q.supervisorId } : {}),
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { employeeCode: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.spg.findMany({ where, include, ...pageArgs(q), orderBy: orderBy(q.sort, ['fullName', 'employeeCode', 'joinDate', 'status'], { fullName: 'asc' }) }),
      this.prisma.spg.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async get(id: string, user: AuthUser) {
    if (!(await this.scope.canAccessSpg(user, id))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG is outside your scope' });
    const spg = await this.prisma.spg.findUnique({
      where: { id },
      include: { ...include,
        assignments: { orderBy: { effectiveFrom: 'desc' }, include: { area: { select: { name: true } }, territory: { select: { name: true } }, supervisor: { select: { user: { select: { fullName: true } } } } } },
        employmentHistory: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!spg) throw new NotFoundException({ code: 'NOT_FOUND', message: 'SPG not found' });
    return spg;
  }

  async create(input: z.infer<typeof spgCreateSchema>, actor: AuthUser) {
    const category = await this.prisma.spgCategory.findUniqueOrThrow({ where: { code: input.category } });
    await this.assertSupervisorInArea(input.supervisorId, input.areaId);
    const spg = await this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      if (input.login) {
        const role = await tx.role.findUniqueOrThrow({ where: { code: ROLE_BY_CATEGORY[input.category] } });
        const area = await tx.area.findUniqueOrThrow({ where: { id: input.areaId } });
        userId = (await tx.user.create({ data: { email: input.login.email, fullName: input.fullName, phone: input.phone, areaId: input.areaId, regionId: area.regionId,
          passwordHash: await hashPassword(input.login.password), roles: { create: [{ roleId: role.id }] } } })).id;
      }
      const created = await tx.spg.create({ data: {
        employeeCode: input.employeeCode.toUpperCase(), fullName: input.fullName, phone: input.phone, categoryId: category.id, joinDate: toDate(input.joinDate),
        currentAreaId: input.areaId, currentSupervisorId: input.supervisorId ?? null, userId,
      }, include });
      await tx.spgAssignment.create({ data: { spgId: created.id, areaId: input.areaId, territoryId: input.territoryId, supervisorId: input.supervisorId, effectiveFrom: toDate(input.joinDate), reason: 'Initial assignment', createdById: actor.id } });
      await tx.spgEmploymentHistory.create({ data: { spgId: created.id, eventType: 'JOINED', toValue: { category: input.category, areaId: input.areaId }, effectiveDate: toDate(input.joinDate), createdById: actor.id } });
      await this.audit.log({ actorId: actor.id, action: 'CREATE', entityType: 'Spg', entityId: created.id, after: { ...input, login: input.login ? { email: input.login.email } : undefined } }, tx);
      return created;
    });
    await this.scope.invalidateAll();
    return spg;
  }

  async update(id: string, input: z.infer<typeof spgUpdateSchema>, actor: AuthUser) {
    const before = await this.get(id, actor);
    if (before.version !== input.expectedVersion) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'SPG was modified by someone else', details: { current: before } });
    const { expectedVersion, reason, category, endDate, ...rest } = input;
    const data: Prisma.SpgUncheckedUpdateInput = { ...rest, version: { increment: 1 } };
    if (endDate !== undefined) data.endDate = endDate ? toDate(endDate) : null;
    if (category) data.categoryId = (await this.prisma.spgCategory.findUniqueOrThrow({ where: { code: category } })).id;
    const today = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.spg.updateMany({ where: { id, version: expectedVersion }, data: data as Prisma.SpgUncheckedUpdateManyInput });
      if (r.count !== 1) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'SPG was modified by someone else' });
      const after = await tx.spg.findUniqueOrThrow({ where: { id }, include });
      if (input.status && input.status !== before.status) {
        await tx.spgEmploymentHistory.create({ data: { spgId: id, eventType: 'STATUS_CHANGED', fromValue: { status: before.status }, toValue: { status: input.status }, effectiveDate: today, note: reason, createdById: actor.id } });
        if (before.userId && ['INACTIVE', 'RESIGNED'].includes(input.status)) {
          await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
          await tx.refreshToken.updateMany({ where: { userId: before.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        }
      }
      if (category && category !== before.category.code) {
        await tx.spgEmploymentHistory.create({ data: { spgId: id, eventType: 'CATEGORY_CHANGED', fromValue: { category: before.category.code }, toValue: { category }, effectiveDate: today, note: reason, createdById: actor.id } });
      }
      const d = diff({ fullName: before.fullName, phone: before.phone, status: before.status, category: before.category.code }, { fullName: after.fullName, phone: after.phone, status: after.status, category: after.category.code });
      await this.audit.log({ actorId: actor.id, action: 'UPDATE', entityType: 'Spg', entityId: id, ...d, reason }, tx);
      return after;
    });
    if (before.userId) await this.scope.invalidateUser(before.userId);
    return updated;
  }

  /** Closes the current assignment and opens a new one (history preserved). */
  async assign(id: string, input: z.infer<typeof spgAssignSchema>, actor: AuthUser) {
    const spg = await this.get(id, actor);
    await this.assertSupervisorInArea(input.supervisorId, input.areaId);
    const from = toDate(input.effectiveFrom);
    const current = spg.assignments.find((a) => a.effectiveTo == null);
    if (current && current.effectiveFrom > from) throw new BadRequestException({ code: 'INVALID_EFFECTIVE_DATE', message: 'Effective date precedes the current assignment' });
    await this.prisma.$transaction(async (tx) => {
      if (current) await tx.spgAssignment.update({ where: { id: current.id }, data: { effectiveTo: from } });
      await tx.spgAssignment.create({ data: { spgId: id, areaId: input.areaId, territoryId: input.territoryId, supervisorId: input.supervisorId, effectiveFrom: from, reason: input.reason, createdById: actor.id } });
      await tx.spg.update({ where: { id }, data: { currentAreaId: input.areaId, currentSupervisorId: input.supervisorId ?? null, version: { increment: 1 } } });
      await tx.spgEmploymentHistory.create({ data: { spgId: id, eventType: 'TRANSFERRED', fromValue: current ? { areaId: current.areaId, supervisorId: current.supervisorId } : undefined, toValue: { areaId: input.areaId, supervisorId: input.supervisorId }, effectiveDate: from, note: input.reason, createdById: actor.id } });
      await this.audit.log({ actorId: actor.id, action: 'REASSIGN', entityType: 'Spg', entityId: id, before: current, after: input, reason: input.reason }, tx);
    });
    await this.scope.invalidateAll();
    return this.get(id, actor);
  }

  private async assertSupervisorInArea(supervisorId: string | null | undefined, areaId: string) {
    if (!supervisorId) return;
    const s = await this.prisma.supervisor.findUnique({ where: { id: supervisorId } });
    if (!s) throw new BadRequestException({ code: 'INVALID_SUPERVISOR', message: 'Supervisor not found' });
    if (s.areaId !== areaId) throw new BadRequestException({ code: 'SUPERVISOR_AREA_MISMATCH', message: 'Supervisor belongs to a different area' });
  }
}

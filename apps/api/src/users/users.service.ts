import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { paginationQuery, userCreateSchema, userUpdateSchema, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService, diff } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { Paginated, pageArgs, orderBy } from '../common/http/paginated';
import { hashPassword } from '../auth/auth.service';

export const userListQuery = paginationQuery.extend({ role: z.string().optional(), isActive: z.enum(['true', 'false']).optional() });
const select = { id: true, email: true, fullName: true, phone: true, isActive: true, regionId: true, areaId: true, lastLoginAt: true, createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } }, region: { select: { name: true } }, area: { select: { name: true } } } satisfies Prisma.UserSelect;
const shape = (u: Prisma.UserGetPayload<{ select: typeof select }>) => ({ ...u, roles: u.roles.map((r) => r.role.code) });

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  async list(q: z.infer<typeof userListQuery>) {
    const where: Prisma.UserWhereInput = {
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.role ? { roles: { some: { role: { code: q.role } } } } : {}),
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select, ...pageArgs(q), orderBy: orderBy(q.sort, ['email', 'fullName', 'createdAt', 'lastLoginAt'], { fullName: 'asc' }) }),
      this.prisma.user.count({ where }),
    ]);
    return new Paginated(items.map(shape), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select });
    if (!u) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return shape(u);
  }

  private async roleIds(codes: string[]) {
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes } } });
    if (roles.length !== new Set(codes).size) throw new BadRequestException({ code: 'UNKNOWN_ROLE', message: 'One or more roles do not exist' });
    return roles.map((r) => r.id);
  }

  async create(input: z.infer<typeof userCreateSchema>, actor: AuthUser) {
    const roleIds = await this.roleIds(input.roleCodes);
    const u = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        email: input.email, fullName: input.fullName, phone: input.phone, regionId: input.regionId, areaId: input.areaId,
        passwordHash: await hashPassword(input.password), roles: { create: roleIds.map((roleId) => ({ roleId })) },
      }, select });
      await this.audit.log({ actorId: actor.id, action: 'CREATE', entityType: 'User', entityId: created.id, after: { ...shape(created) } }, tx);
      return created;
    });
    return shape(u);
  }

  async update(id: string, input: z.infer<typeof userUpdateSchema>, actor: AuthUser) {
    if (id === actor.id && input.isActive === false) throw new BadRequestException({ code: 'SELF_DEACTIVATION', message: 'You cannot deactivate your own account' });
    const before = await this.get(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.roleCodes) {
        const roleIds = await this.roleIds(input.roleCodes);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      const { roleCodes: _r, ...data } = input;
      const u = await tx.user.update({ where: { id }, data, select });
      if (input.isActive === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      const d = diff(before as never, shape(u) as never);
      await this.audit.log({ actorId: actor.id, action: input.isActive === false ? 'DEACTIVATE' : 'UPDATE', entityType: 'User', entityId: id, ...d }, tx);
      return u;
    });
    await this.scope.invalidateUser(id);
    return shape(updated);
  }

  async resetPassword(id: string, password: string, actor: AuthUser) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, passwordChangedAt: new Date() } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, action: 'PASSWORD_RESET', entityType: 'User', entityId: id });
    await this.scope.invalidateUser(id);
  }
}

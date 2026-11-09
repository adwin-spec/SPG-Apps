import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';

const roleCreate = z.object({ code: z.string().regex(/^[A-Z_]{3,48}$/), name: z.string().min(2).max(120), description: z.string().max(500).optional(), permissionCodes: z.array(z.string()).default([]) });
const rolePerms = z.object({ permissionCodes: z.array(z.string()) });

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  @Get() @RequirePermissions(PERMISSIONS.USERS_READ)
  async list() {
    const roles = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem, userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.code) }));
  }

  @Get('permissions') @RequirePermissions(PERMISSIONS.USERS_READ)
  permissions() { return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }); }

  @Post() @RequirePermissions(PERMISSIONS.ROLES_MANAGE) @ApiZodBody(roleCreate)
  async create(@Body(new ZodPipe(roleCreate)) body: z.infer<typeof roleCreate>, @CurrentUser() u: AuthUser) {
    const perms = await this.prisma.permission.findMany({ where: { code: { in: body.permissionCodes } } });
    const role = await this.prisma.role.create({ data: { code: body.code, name: body.name, description: body.description, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'Role', entityId: role.id, after: body });
    return role;
  }

  @Put(':id/permissions') @RequirePermissions(PERMISSIONS.ROLES_MANAGE) @ApiZodBody(rolePerms)
  async setPermissions(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rolePerms)) body: z.infer<typeof rolePerms>, @CurrentUser() u: AuthUser) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (role.isSystem) throw new BadRequestException({ code: 'SYSTEM_ROLE', message: 'System roles are managed by the RBAC catalogue; create a custom role instead' });
    const perms = await this.prisma.permission.findMany({ where: { code: { in: body.permissionCodes } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) }),
    ]);
    await this.audit.log({ actorId: u.id, action: 'SET_PERMISSIONS', entityType: 'Role', entityId: id, before: role.permissions.map((p) => p.permission.code), after: body.permissionCodes });
    await this.scope.invalidateAll();
    return { ok: true };
  }
}

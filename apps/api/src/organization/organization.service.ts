import { BadRequestException, Injectable } from '@nestjs/common';
import { ROLES, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';

type Level = 'region' | 'area' | 'district' | 'subdistrict' | 'territory';
const PARENT: Record<Level, string | null> = { region: null, area: 'regionId', district: 'areaId', subdistrict: 'districtId', territory: 'areaId' };
const MODEL: Record<Level, string> = { region: 'Region', area: 'Area', district: 'District', subdistrict: 'Subdistrict', territory: 'Territory' };

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  private delegate(level: Level) { return (this.prisma as unknown as Record<Level, { findMany: Function; create: Function; update: Function; findUniqueOrThrow: Function }>)[level]; }

  list(level: Level, parentId?: string) {
    const parent = PARENT[level];
    return this.delegate(level).findMany({ where: parent && parentId ? { [parent]: parentId } : {}, orderBy: { name: 'asc' } });
  }

  async createRegion(input: { code: string; name: string; companyId?: string }, actor: AuthUser) {
    const companyId = input.companyId ?? (await this.prisma.company.findFirstOrThrow()).id;
    return this.create('region', { ...input, companyId }, actor);
  }

  async create(level: Level, data: Record<string, unknown>, actor: AuthUser) {
    const row = await this.delegate(level).create({ data });
    await this.audit.log({ actorId: actor.id, action: 'CREATE', entityType: MODEL[level], entityId: row.id, after: row });
    return row;
  }

  async update(level: Level, id: string, data: Record<string, unknown>, actor: AuthUser) {
    const before = await this.delegate(level).findUniqueOrThrow({ where: { id } });
    const row = await this.delegate(level).update({ where: { id }, data });
    await this.audit.log({ actorId: actor.id, action: 'UPDATE', entityType: MODEL[level], entityId: id, before, after: row });
    return row;
  }

  async supervisors(user: AuthUser, areaId?: string) {
    const areas = await this.scope.areaIds(user);
    return (await this.prisma.supervisor.findMany({
      where: { ...(areaId ? { areaId } : {}), ...(areas ? { areaId: { in: areas } } : {}) },
      include: { user: { select: { fullName: true, email: true } }, area: { select: { name: true } }, _count: { select: { spgs: true } } },
      orderBy: { user: { fullName: 'asc' } },
    })).map((s) => ({ id: s.id, userId: s.userId, fullName: s.user.fullName, email: s.user.email, areaId: s.areaId, areaName: s.area.name, status: s.status, spgCount: s._count.spgs }));
  }

  async createSupervisor(input: { userId: string; areaId: string }, actor: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId }, include: { roles: { include: { role: true } } } });
    if (!u.roles.some((r) => r.role.code === ROLES.SUPERVISOR)) throw new BadRequestException({ code: 'NOT_A_SUPERVISOR', message: 'User must have the SUPERVISOR role' });
    const s = await this.prisma.supervisor.create({ data: input });
    await this.prisma.user.update({ where: { id: input.userId }, data: { areaId: input.areaId } });
    await this.audit.log({ actorId: actor.id, action: 'CREATE', entityType: 'Supervisor', entityId: s.id, after: s });
    await this.scope.invalidateUser(input.userId);
    return s;
  }

  async tree(user: AuthUser) {
    const areas = await this.scope.areaIds(user);
    const regions = await this.prisma.region.findMany({
      where: areas ? { areas: { some: { id: { in: areas } } } } : {},
      orderBy: { name: 'asc' },
      include: { areas: { where: areas ? { id: { in: areas } } : {}, orderBy: { name: 'asc' },
        include: { districts: { orderBy: { name: 'asc' }, include: { subdistricts: { orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } } } } } } },
    });
    return regions.map((r) => ({ id: r.id, code: r.code, name: r.name, areas: r.areas.map((a) => ({ id: a.id, code: a.code, name: a.name,
      districts: a.districts.map((d) => ({ id: d.id, code: d.code, name: d.name, subdistricts: d.subdistricts })) })) }));
  }
}

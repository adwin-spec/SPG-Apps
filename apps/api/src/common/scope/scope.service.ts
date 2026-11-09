import { Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { ROLES, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type SpgScope = { all: true } | { all: false; spgIds: string[] };

const NATIONAL_SCOPE = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.NATIONAL_MANAGER, ROLES.BUSINESS_ANALYST, ROLES.VIEWER]);

/**
 * Row-level data scope (ADR D5). Every query on SPG-owned data must be filtered with this.
 *  SPG → own records · Supervisor → own SPGs · Area Mgr → area · Regional Mgr → region · national roles → all.
 * A user with several roles gets the union.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async spgScope(user: AuthUser): Promise<SpgScope> {
    if (user.roles.some((r) => NATIONAL_SCOPE.has(r))) return { all: true };
    const key = `scope:spg:${user.id}`;
    const cached = await this.redis.getJson<string[]>(key);
    if (cached) return { all: false, spgIds: cached };
    const ors: Prisma.SpgWhereInput[] = [];
    if (user.spgId) ors.push({ id: user.spgId });
    if (user.roles.includes(ROLES.SUPERVISOR) && user.supervisorId) ors.push({ currentSupervisorId: user.supervisorId });
    if (user.roles.includes(ROLES.AREA_MANAGER) && user.areaId) ors.push({ currentAreaId: user.areaId });
    if (user.roles.includes(ROLES.REGIONAL_MANAGER) && user.regionId) ors.push({ currentArea: { regionId: user.regionId } });
    const ids = ors.length ? (await this.prisma.spg.findMany({ where: { OR: ors }, select: { id: true } })).map((s) => s.id) : [];
    await this.redis.setJson(key, ids, 60);
    return { all: false, spgIds: ids };
  }

  /** Prisma filter for tables with an `spgId` column. */
  async spgIdFilter(user: AuthUser): Promise<{ spgId?: { in: string[] } }> {
    const s = await this.spgScope(user);
    return s.all ? {} : { spgId: { in: s.spgIds } };
  }

  /** Raw-SQL fragment for analytics: returns null when unrestricted. */
  async spgIdList(user: AuthUser): Promise<string[] | null> {
    const s = await this.spgScope(user);
    return s.all ? null : s.spgIds;
  }

  async canAccessSpg(user: AuthUser, spgId: string): Promise<boolean> {
    const s = await this.spgScope(user);
    return s.all || s.spgIds.includes(spgId);
  }

  /** Area ids visible to the user (for outlets / master data). null = all. */
  async areaIds(user: AuthUser): Promise<string[] | null> {
    if (user.roles.some((r) => NATIONAL_SCOPE.has(r))) return null;
    const ids = new Set<string>();
    if (user.areaId) ids.add(user.areaId);
    if (user.roles.includes(ROLES.REGIONAL_MANAGER) && user.regionId) {
      (await this.prisma.area.findMany({ where: { regionId: user.regionId }, select: { id: true } })).forEach((a) => ids.add(a.id));
    }
    if (user.spgId) {
      const spg = await this.prisma.spg.findUnique({ where: { id: user.spgId }, select: { currentAreaId: true } });
      if (spg) ids.add(spg.currentAreaId);
    }
    return [...ids];
  }

  /** Outlet visibility: managers by area; SPGs see their assigned outlets + retailers/outlets of their area. */
  async outletFilter(user: AuthUser): Promise<Prisma.OutletWhereInput> {
    const areas = await this.areaIds(user);
    if (areas === null) return {};
    return { district: { areaId: { in: areas } } };
  }

  async invalidateUser(userId: string) { await this.redis.del(`scope:spg:${userId}`, `auth:user:${userId}`); }
  async invalidateAll() { await this.redis.delPattern('scope:spg:*'); }
}

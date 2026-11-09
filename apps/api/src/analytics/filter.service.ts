import { Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { jakartaDate, type AnalyticsFilter, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';

export interface ResolvedFilter {
  from: string; to: string; toExclusive: string;
  spgIds: string[];                         // already intersected with the user's scope
  outletSql: (alias: string) => Prisma.Sql; // geography/outlet restriction on an outlet_id column
  variantSql: (alias: string) => Prisma.Sql;
  brandSql: (alias: string) => Prisma.Sql;
  final: string[]; finalVisit: string[];
  raw: AnalyticsFilter;
}

/**
 * One filter resolver for every dashboard, drill-down and export, so numbers are consistent
 * across screens and an export always reproduces the on-screen filter (brief §J.5, §M).
 */
@Injectable()
export class FilterService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly settings: SettingsService) {}

  async resolve(user: AuthUser, f: AnalyticsFilter): Promise<ResolvedFilter> {
    const to = f.to ?? jakartaDate();
    const from = f.from ?? `${to.slice(0, 7)}-01`;
    const toExclusive = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
    const scope = await this.scope.spgScope(user);
    const where: Prisma.SpgWhereInput = {
      ...(scope.all ? {} : { id: { in: scope.spgIds } }),
      ...(f.spgId ? { id: scope.all ? f.spgId : { in: scope.spgIds.filter((i) => i === f.spgId) } } : {}),
      ...(f.category ? { category: { code: f.category } } : {}),
      ...(f.areaId ? { currentAreaId: f.areaId } : {}),
      ...(f.regionId ? { currentArea: { regionId: f.regionId } } : {}),
      ...(f.supervisorId ? { currentSupervisorId: f.supervisorId } : {}),
    };
    const spgIds = (await this.prisma.spg.findMany({ where, select: { id: true } })).map((s) => s.id);
    const geo: Prisma.Sql[] = [];
    if (f.outletId) geo.push(Prisma.sql`o.id = ${f.outletId}::uuid`);
    if (f.subdistrictId) geo.push(Prisma.sql`o.subdistrict_id = ${f.subdistrictId}::uuid`);
    if (f.districtId) geo.push(Prisma.sql`o.district_id = ${f.districtId}::uuid`);
    const outletSql = (alias: string) => geo.length
      ? Prisma.sql`AND ${Prisma.raw(alias)} IN (SELECT o.id FROM outlets o WHERE ${Prisma.join(geo, ' AND ')})` : Prisma.empty;
    const variantSql = (alias: string) => f.productVariantId ? Prisma.sql`AND ${Prisma.raw(alias)} = ${f.productVariantId}::uuid`
      : f.productId ? Prisma.sql`AND ${Prisma.raw(alias)} IN (SELECT id FROM product_variants WHERE product_id = ${f.productId}::uuid)` : Prisma.empty;
    const brandSql = (alias: string) => f.brandId ? Prisma.sql`AND ${Prisma.raw(alias)} = ${f.brandId}::uuid`
      : f.competitorId ? Prisma.sql`AND ${Prisma.raw(alias)} IN (SELECT id FROM brands WHERE competitor_id = ${f.competitorId}::uuid)` : Prisma.empty;
    const [final, finalVisit] = await Promise.all([this.settings.get<string[]>('kpi.finalStatuses'), this.settings.get<string[]>('kpi.finalVisitStatuses')]);
    return { from, to, toExclusive, spgIds, outletSql, variantSql, brandSql, final, finalVisit, raw: f };
  }
}

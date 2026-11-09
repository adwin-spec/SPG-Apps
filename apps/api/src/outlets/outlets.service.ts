import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { normalizeOutletName, outletCreateSchema, outletUpdateSchema, paginationQuery, retailerLinkSchema, PERMISSIONS, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService, diff } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, orderBy, pageArgs } from '../common/http/paginated';

export const outletListQuery = paginationQuery.extend({
  channel: z.enum(['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR']).optional(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED']).optional(),
  areaId: z.uuid().optional(), districtId: z.uuid().optional(), subdistrictId: z.uuid().optional(),
  assignedSpgId: z.uuid().optional(), wholesalerId: z.uuid().optional(), mine: z.enum(['true', 'false']).optional(),
});
export const duplicateQuery = z.object({ name: z.string().trim().min(2).max(200), districtId: z.uuid().optional(), channel: z.enum(['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR']).optional() });

const include = {
  category: { select: { code: true, name: true } },
  district: { select: { id: true, name: true, area: { select: { id: true, name: true } } } },
  subdistrict: { select: { id: true, name: true } },
  assignedSpg: { select: { id: true, fullName: true, employeeCode: true } },
} satisfies Prisma.OutletInclude;

export interface DuplicateCandidate { id: string; code: string; name: string; channel: string; district: string; similarity: number }

@Injectable()
export class OutletsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly settings: SettingsService) {}

  async list(q: z.infer<typeof outletListQuery>, user: AuthUser) {
    const scoped = await this.scope.outletFilter(user);
    const where: Prisma.OutletWhereInput = {
      AND: [scoped,
        q.channel ? { channel: q.channel } : {}, q.status ? { status: q.status } : {},
        q.areaId ? { district: { areaId: q.areaId } } : {}, q.districtId ? { districtId: q.districtId } : {},
        q.subdistrictId ? { subdistrictId: q.subdistrictId } : {}, q.assignedSpgId ? { assignedSpgId: q.assignedSpgId } : {},
        q.mine === 'true' && user.spgId ? { assignedSpgId: user.spgId } : {},
        q.wholesalerId ? { retailerLinks: { some: { wholesalerOutletId: q.wholesalerId, effectiveTo: null } } } : {},
        q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { normalizedName: { contains: normalizeOutletName(q.q) } }] } : {},
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.outlet.findMany({ where, include, ...pageArgs(q), orderBy: orderBy(q.sort, ['name', 'code', 'createdAt', 'status', 'channel'], { name: 'asc' }) }),
      this.prisma.outlet.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async get(id: string, user: AuthUser) {
    const scoped = await this.scope.outletFilter(user);
    const o = await this.prisma.outlet.findFirst({
      where: { AND: [{ id }, scoped] },
      include: { ...include,
        assignmentHistory: { orderBy: { effectiveFrom: 'desc' }, take: 20 },
        retailerLinks: { orderBy: { effectiveFrom: 'desc' }, include: { wholesaler: { select: { id: true, name: true, code: true } } } },
        wholesalerLinks: { where: { effectiveTo: null }, include: { retailer: { select: { id: true, name: true, code: true, status: true } } } },
      },
    });
    if (!o) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Outlet not found or out of scope' });
    return o;
  }

  /** Fuzzy duplicate candidates using pg_trgm similarity on the normalised name (risk R6). */
  async findDuplicates(name: string, districtId?: string, channel?: string, excludeId?: string): Promise<DuplicateCandidate[]> {
    const threshold = await this.settings.get<number>('retailers.duplicateSimilarityThreshold');
    const norm = normalizeOutletName(name);
    return this.prisma.$queryRaw<DuplicateCandidate[]>`
      SELECT o.id, o.code, o.name, o.channel::text AS channel, d.name AS district,
             round(similarity(o.normalized_name, ${norm})::numeric, 3)::float AS similarity
      FROM outlets o JOIN districts d ON d.id = o.district_id
      WHERE similarity(o.normalized_name, ${norm}) >= ${threshold}
        AND o.status <> 'CLOSED'
        ${districtId ? Prisma.sql`AND o.district_id = ${districtId}::uuid` : Prisma.empty}
        ${channel ? Prisma.sql`AND o.channel = ${channel}::"OutletChannel"` : Prisma.empty}
        ${excludeId ? Prisma.sql`AND o.id <> ${excludeId}::uuid` : Prisma.empty}
      ORDER BY similarity DESC LIMIT 10`;
  }

  async create(input: z.infer<typeof outletCreateSchema>, user: AuthUser) {
    const isManager = user.permissions.includes(PERMISSIONS.OUTLET_MANAGE);
    if (!isManager) {
      // Field creation: SPG Grosir may register new retailers only; becomes PROSPECT until verified.
      if (input.channel !== 'RETAILER') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Field users may only register retailers' });
      input = { ...input, status: 'PROSPECT', assignedSpgId: null };
    }
    const areas = await this.scope.areaIds(user);
    const district = await this.prisma.district.findUniqueOrThrow({ where: { id: input.districtId } });
    if (areas && !areas.includes(district.areaId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'District is outside your area' });
    if (input.subdistrictId) {
      const sd = await this.prisma.subdistrict.findUniqueOrThrow({ where: { id: input.subdistrictId } });
      if (sd.districtId !== input.districtId) throw new BadRequestException({ code: 'SUBDISTRICT_MISMATCH', message: 'Kecamatan does not belong to the selected Kabupaten' });
    }
    if (input.channel !== 'RETAILER' && (input.primaryWholesalerId || input.alternativeWholesalerIds?.length)) {
      throw new BadRequestException({ code: 'INVALID_LINK', message: 'Only retailers can be linked to wholesalers' });
    }
    const duplicates = await this.findDuplicates(input.name, input.districtId, input.channel);
    if (duplicates.length && !input.confirmNotDuplicate) {
      throw new ConflictException({ code: 'POSSIBLE_DUPLICATE', message: 'Similar outlets already exist. Review candidates or confirm this is a new outlet.', details: duplicates });
    }
    const wholesalerIds = [input.primaryWholesalerId, ...(input.alternativeWholesalerIds ?? [])].filter(Boolean) as string[];
    if (wholesalerIds.length) {
      const ws = await this.prisma.outlet.count({ where: { id: { in: wholesalerIds }, channel: 'WHOLESALER' } });
      if (ws !== new Set(wholesalerIds).size) throw new BadRequestException({ code: 'INVALID_WHOLESALER', message: 'Linked outlet is not a wholesaler' });
    }
    const { primaryWholesalerId, alternativeWholesalerIds, confirmNotDuplicate, code, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint + 1 AS n FROM outlets WHERE channel = ${input.channel}::"OutletChannel"`;
      const prefix = { WHOLESALER: 'WS', RETAILER: 'RT', HORECA: 'HO', REGULAR: 'RG' }[input.channel];
      const outlet = await tx.outlet.create({ data: { ...data, code: code ?? `${prefix}-${String(seq[0].n).padStart(6, '0')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        normalizedName: normalizeOutletName(input.name), createdById: user.id }, include });
      if (primaryWholesalerId) await tx.retailerWholesaleRelationship.create({ data: { retailerOutletId: outlet.id, wholesalerOutletId: primaryWholesalerId, relationType: 'PRIMARY', createdById: user.id } });
      for (const w of alternativeWholesalerIds ?? []) if (w !== primaryWholesalerId) await tx.retailerWholesaleRelationship.create({ data: { retailerOutletId: outlet.id, wholesalerOutletId: w, relationType: 'ALTERNATIVE', createdById: user.id } });
      if (outlet.assignedSpgId) await tx.outletAssignmentHistory.create({ data: { outletId: outlet.id, spgId: outlet.assignedSpgId, effectiveFrom: new Date(), reason: 'Initial assignment', createdById: user.id } });
      await this.audit.log({ actorId: user.id, action: 'CREATE', entityType: 'Outlet', entityId: outlet.id, after: input, reason: duplicates.length ? `Confirmed not duplicate of ${duplicates.map((d) => d.code).join(', ')}` : null }, tx);
      return outlet;
    });
  }

  async update(id: string, input: z.infer<typeof outletUpdateSchema>, user: AuthUser) {
    const before = await this.get(id, user);
    if (before.version !== input.expectedVersion) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Outlet was modified by someone else', details: { current: before } });
    const { expectedVersion, reason, ...data } = input;
    const patch: Prisma.OutletUncheckedUpdateManyInput = { ...data, version: { increment: 1 } };
    if (data.name) patch.normalizedName = normalizeOutletName(data.name);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.outlet.updateMany({ where: { id, version: expectedVersion }, data: patch });
      if (r.count !== 1) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Outlet was modified by someone else' });
      if (data.assignedSpgId !== undefined && data.assignedSpgId !== before.assignedSpgId) {
        await tx.outletAssignmentHistory.updateMany({ where: { outletId: id, effectiveTo: null }, data: { effectiveTo: new Date() } });
        await tx.outletAssignmentHistory.create({ data: { outletId: id, spgId: data.assignedSpgId, effectiveFrom: new Date(), reason, createdById: user.id } });
      }
      const after = await tx.outlet.findUniqueOrThrow({ where: { id }, include });
      const { before: b, after: a } = diff(before as never, after as never);
      delete (b as Record<string, unknown>).updatedAt; delete (a as Record<string, unknown>).updatedAt;
      await this.audit.log({ actorId: user.id, action: 'UPDATE', entityType: 'Outlet', entityId: id, before: b, after: a, reason }, tx);
      return after;
    });
  }

  async link(retailerId: string, input: z.infer<typeof retailerLinkSchema>, user: AuthUser) {
    const r = await this.get(retailerId, user);
    if (r.channel !== 'RETAILER') throw new BadRequestException({ code: 'NOT_RETAILER', message: 'Outlet is not a retailer' });
    const w = await this.prisma.outlet.findUniqueOrThrow({ where: { id: input.wholesalerOutletId } });
    if (w.channel !== 'WHOLESALER') throw new BadRequestException({ code: 'NOT_WHOLESALER', message: 'Target outlet is not a wholesaler' });
    return this.prisma.$transaction(async (tx) => {
      if (input.relationType === 'PRIMARY') {
        await tx.retailerWholesaleRelationship.updateMany({ where: { retailerOutletId: retailerId, relationType: 'PRIMARY', effectiveTo: null }, data: { effectiveTo: new Date() } });
      }
      await tx.retailerWholesaleRelationship.updateMany({ where: { retailerOutletId: retailerId, wholesalerOutletId: input.wholesalerOutletId, effectiveTo: null }, data: { effectiveTo: new Date() } });
      const link = await tx.retailerWholesaleRelationship.create({ data: { retailerOutletId: retailerId, wholesalerOutletId: input.wholesalerOutletId, relationType: input.relationType, createdById: user.id } });
      await this.audit.log({ actorId: user.id, action: 'LINK_WHOLESALER', entityType: 'Outlet', entityId: retailerId, after: input }, tx);
      return link;
    });
  }

  async unlink(retailerId: string, linkId: string, user: AuthUser) {
    await this.get(retailerId, user);
    const link = await this.prisma.retailerWholesaleRelationship.update({ where: { id: linkId, retailerOutletId: retailerId }, data: { effectiveTo: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'UNLINK_WHOLESALER', entityType: 'Outlet', entityId: retailerId, before: link });
    return link;
  }
}

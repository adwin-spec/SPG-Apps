import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { competitorObservationSchema, paginationQuery, PERMISSIONS, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { FieldRecordsService } from '../common/field-records.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';
import { requireSpg } from '../common/field-guard';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const obsListQuery = paginationQuery.extend({ from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), outletId: z.uuid().optional(),
  brandId: z.uuid().optional(), channel: z.enum(['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR']).optional(), mine: z.enum(['true', 'false']).optional() });

/** Competitor intelligence for all three SPG categories (ADR D3). */
@Injectable()
export class CompetitorsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly field: FieldRecordsService) {}

  async create(user: AuthUser, input: z.infer<typeof competitorObservationSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.competitorObservation.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    const outlet = await this.field.outletFor(user, input.outletId);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.observationDate);
    await this.field.ownFile(user.id, input.photoFileId);
    let brandId = input.brandId ?? null;
    if (input.competitorProductId) {
      const cp = await this.prisma.competitorProduct.findUnique({ where: { id: input.competitorProductId } });
      if (!cp) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Unknown competitor product' });
      brandId = cp.brandId;
    }
    if (brandId) {
      const b = await this.prisma.brand.findUnique({ where: { id: brandId } });
      if (!b || b.owner !== 'COMPETITOR') throw new BadRequestException({ code: 'NOT_COMPETITOR_BRAND', message: 'Brand is not a competitor brand' });
    }
    if (input.wholesalerOutletId) {
      const w = await this.prisma.outlet.findUnique({ where: { id: input.wholesalerOutletId } });
      if (!w || w.channel !== 'WHOLESALER') throw new BadRequestException({ code: 'INVALID_WHOLESALER', message: 'Not a wholesaler' });
    }
    const { clientRecordedAt, ...data } = input;
    // Free-text brand without master mapping ⇒ needs review (master data enrichment).
    const status = brandId ? 'VALIDATED' : 'NEEDS_REVIEW';
    return this.prisma.competitorObservation.create({ data: { ...data, brandId, spgId, channel: outlet.channel, observationDate: toDate(input.observationDate), validationStatus: status,
      source: clientRecordedAt && Date.now() - Date.parse(clientRecordedAt) > 300000 ? 'OFFLINE_SYNC' : 'MANUAL' } });
  }

  async list(user: AuthUser, q: z.infer<typeof obsListQuery>) {
    const scoped = q.mine === 'true' || !user.permissions.includes(PERMISSIONS.INTEL_READ) ? { spgId: requireSpg(user) } : await this.scope.spgIdFilter(user);
    const where: Prisma.CompetitorObservationWhereInput = { AND: [scoped, q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {},
      q.brandId ? { brandId: q.brandId } : {}, q.channel ? { channel: q.channel } : {},
      q.from || q.to ? { observationDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.competitorObservation.findMany({ where, include: { brand: { select: { name: true } }, competitorProduct: { select: { name: true, variant: true } }, outlet: { select: { name: true, code: true } }, spg: { select: { fullName: true } } },
        orderBy: { observationDate: 'desc' }, ...pageArgs(q) }),
      this.prisma.competitorObservation.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }
}

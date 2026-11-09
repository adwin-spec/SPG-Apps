import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { availabilityBatchSchema, outletOrderSchema, paginationQuery, shareOfShelf, visibilityRecordSchema, PERMISSIONS, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { AuditService } from '../common/audit/audit.service';
import { FieldRecordsService } from '../common/field-records.service';
import { requireSpg } from '../common/field-guard';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const regularListQuery = paginationQuery.extend({ from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), outletId: z.uuid().optional(),
  status: z.enum(['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVERSED']).optional(), mine: z.enum(['true', 'false']).optional() });

@Injectable()
export class RegularService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly audit: AuditService, private readonly field: FieldRecordsService) {}

  /** Batch of SKU availability checks; each line carries its own clientId so partial replays are safe. */
  async availability(user: AuthUser, input: z.infer<typeof availabilityBatchSchema>) {
    const spgId = requireSpg(user);
    await this.field.outletFor(user, input.outletId, ['REGULAR']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.recordDate);
    const skus = new Set(input.items.map((i) => i.productVariantId));
    if (skus.size !== input.items.length) throw new BadRequestException({ code: 'DUPLICATE_SKU', message: 'Each SKU may appear once per check' });
    const valid = await this.prisma.productVariant.count({ where: { id: { in: [...skus] } } });
    if (valid !== skus.size) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Unknown SKU in batch' });
    const r = await this.prisma.availabilityRecord.createMany({ skipDuplicates: true, data: input.items.map((i) => ({
      clientId: i.clientId, spgId, visitId: input.visitId, outletId: input.outletId, productVariantId: i.productVariantId, recordDate: toDate(input.recordDate),
      isAvailable: i.isAvailable, stockQuantity: i.stockQuantity, oosReason: i.isAvailable ? null : i.oosReason, lastRestockDate: i.lastRestockDate ? toDate(i.lastRestockDate) : null,
      validationStatus: i.isAvailable && i.stockQuantity === 0 ? 'NEEDS_REVIEW' : 'VALIDATED',
    })) });
    return { received: input.items.length, created: r.count, replayed: input.items.length - r.count };
  }

  async visibility(user: AuthUser, input: z.infer<typeof visibilityRecordSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.visibilityRecord.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    await this.field.outletFor(user, input.outletId, ['REGULAR']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.recordDate);
    await this.field.ownFile(user.id, input.photoFileId);
    const { clientRecordedAt, ...data } = input;
    return this.prisma.visibilityRecord.create({ data: { ...data, spgId, recordDate: toDate(input.recordDate),
      shareOfShelfPct: shareOfShelf(input.companyFacing, input.totalCategoryFacing), // NULL when total = 0 (R3)
      validationStatus: input.photoFileId ? 'VALIDATED' : 'NEEDS_REVIEW' } });
  }

  async order(user: AuthUser, input: z.infer<typeof outletOrderSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.outletOrder.findUnique({ where: { clientId: input.clientId }, include: { items: true } });
    if (replay) return replay;
    await this.field.outletFor(user, input.outletId, ['REGULAR']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.orderDate);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: input.items.map((i) => i.productVariantId) } } });
    if (variants.length !== new Set(input.items.map((i) => i.productVariantId)).size) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Unknown SKU in order' });
    const lines = input.items.map((i, idx) => ({ ...i, lineNo: idx + 1, lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100 }));
    const priceOutlier = lines.some((l) => { const v = variants.find((x) => x.id === l.productVariantId); return v?.listPrice && Math.abs(l.unitPrice - Number(v.listPrice)) / Number(v.listPrice) > 0.5; });
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('outlet_order_no_seq') AS n`;
      const o = await tx.outletOrder.create({ data: {
        orderNo: `ORD-${input.orderDate.replace(/-/g, '').slice(2)}-${String(seq[0].n).padStart(6, '0')}`, clientId: input.clientId, spgId, visitId: input.visitId, outletId: input.outletId,
        orderDate: toDate(input.orderDate), status: input.status, isRestock: input.isRestock, notes: input.notes,
        totalQuantity: lines.reduce((a, l) => a + l.quantity, 0), totalValue: lines.reduce((a, l) => a + l.lineTotal, 0),
        validationStatus: priceOutlier ? 'NEEDS_REVIEW' : 'VALIDATED',
        items: { create: lines.map((l) => ({ lineNo: l.lineNo, productVariantId: l.productVariantId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
      }, include: { items: true } });
      if (input.visitId) await tx.visit.update({ where: { id: input.visitId }, data: { orderStatus: input.status } });
      await this.audit.log({ actorId: user.id, action: 'CREATE', entityType: 'OutletOrder', entityId: o.id, after: { orderNo: o.orderNo, totalValue: o.totalValue } }, tx);
      return o;
    });
  }

  private async scoped(user: AuthUser, mine?: string) {
    return mine === 'true' || !user.permissions.includes(PERMISSIONS.TRANSACTION_READ) ? { spgId: requireSpg(user) } : this.scope.spgIdFilter(user);
  }
  private dateRange(field: string, q: { from?: string; to?: string }) {
    return q.from || q.to ? { [field]: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {};
  }

  async orders(user: AuthUser, q: z.infer<typeof regularListQuery>) {
    const where: Prisma.OutletOrderWhereInput = { AND: [await this.scoped(user, q.mine), q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {}, q.status ? { validationStatus: q.status } : {}, this.dateRange('orderDate', q)] };
    const [items, total] = await Promise.all([
      this.prisma.outletOrder.findMany({ where, include: { outlet: { select: { name: true, code: true } }, spg: { select: { fullName: true } }, items: { include: { productVariant: { select: { sku: true, name: true } } } } }, orderBy: { orderDate: 'desc' }, ...pageArgs(q) }),
      this.prisma.outletOrder.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async availabilityList(user: AuthUser, q: z.infer<typeof regularListQuery>) {
    const where: Prisma.AvailabilityRecordWhereInput = { AND: [await this.scoped(user, q.mine), q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {}, this.dateRange('recordDate', q)] };
    const [items, total] = await Promise.all([
      this.prisma.availabilityRecord.findMany({ where, include: { outlet: { select: { name: true } }, productVariant: { select: { sku: true, name: true } } }, orderBy: { recordDate: 'desc' }, ...pageArgs(q) }),
      this.prisma.availabilityRecord.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async visibilityList(user: AuthUser, q: z.infer<typeof regularListQuery>) {
    const where: Prisma.VisibilityRecordWhereInput = { AND: [await this.scoped(user, q.mine), q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {}, this.dateRange('recordDate', q)] };
    const [items, total] = await Promise.all([
      this.prisma.visibilityRecord.findMany({ where, include: { outlet: { select: { name: true } }, spg: { select: { fullName: true } } }, orderBy: { recordDate: 'desc' }, ...pageArgs(q) }),
      this.prisma.visibilityRecord.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }
}

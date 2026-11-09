import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, DataSource, ValidationStatus } from '@tanda/database';
import { z } from 'zod';
import { jakartaDate, paginationQuery, retailerTransactionSchema, transactionCorrectionSchema, transactionItemSchema, PERMISSIONS, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, orderBy, pageArgs, toDate } from '../common/http/paginated';
import { ApprovalsService } from '../approvals/approvals.service';
import { ValidationIssue, classifyDuplicate, lineSignature, outcome } from './transaction-validation';

type Item = z.infer<typeof transactionItemSchema>;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const txListQuery = paginationQuery.extend({
  from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), retailerId: z.uuid().optional(), wholesalerId: z.uuid().optional(),
  status: z.enum(['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVERSED']).optional(),
  dataNature: z.enum(['ACTUAL', 'ESTIMATE', 'OBSERVATION']).optional(), duplicateType: z.enum(['NONE', 'EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE', 'RE_UPLOAD', 'CORRECTED_SUBMISSION']).optional(),
  source: z.enum(['MANUAL', 'OFFLINE_SYNC', 'OCR', 'IMPORT']).optional(), mine: z.enum(['true', 'false']).optional(),
});

const include = {
  retailer: { select: { id: true, code: true, name: true } },
  wholesaler: { select: { id: true, code: true, name: true } },
  spg: { select: { id: true, fullName: true, employeeCode: true } },
  items: { orderBy: { lineNo: 'asc' }, include: { productVariant: { select: { sku: true, name: true } }, competitorProduct: { select: { name: true, variant: true, brand: { select: { name: true } } } } } },
} satisfies Prisma.RetailerTransactionInclude;

export type CreateTxInput = z.infer<typeof retailerTransactionSchema> & { correctionOf?: string | null; correctionReason?: string | null };
export interface CreateTxContext { spgId: string; createdById: string; source: DataSource; fileLogId?: string | null; forceStatus?: ValidationStatus }

@Injectable()
export class TransactionsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService,
    private readonly settings: SettingsService, private readonly approvals: ApprovalsService) {}

  onModuleInit() {
    // Reversal of an APPROVED transaction is applied only after a second person approves it.
    this.approvals.register('RetailerTransaction', 'REVERSAL', async (tx, a, actor) => {
      const t = await tx.retailerTransaction.findUniqueOrThrow({ where: { id: a.entityId } });
      if (t.validationStatus !== 'APPROVED') throw new ConflictException({ code: 'NOT_APPROVED', message: 'Only approved transactions can be reversed' });
      await tx.retailerTransaction.update({ where: { id: t.id }, data: { validationStatus: 'REVERSED', correctionReason: a.reason, version: { increment: 1 } } });
      await this.audit.log({ actorId: actor.id, action: 'REVERSE', entityType: 'RetailerTransaction', entityId: t.id, before: { validationStatus: 'APPROVED' }, after: { validationStatus: 'REVERSED' }, reason: a.reason }, tx);
      return t.id;
    });
  }

  /** Automated validation layer (RAW → VALIDATED / NEEDS_REVIEW). */
  async validate(input: { retailerOutletId: string; wholesalerOutletId?: string | null; transactionDate: string; items: Item[] }, spgId: string) {
    const issues: ValidationIssue[] = [];
    const retailer = await this.prisma.outlet.findUnique({ where: { id: input.retailerOutletId }, include: { retailerLinks: { where: { effectiveTo: null } } } });
    if (!retailer) throw new BadRequestException({ code: 'INVALID_OUTLET', message: 'Retailer does not exist' });
    if (retailer.channel !== 'RETAILER') throw new BadRequestException({ code: 'NOT_RETAILER', message: 'Outlet is not a retailer' });
    if (retailer.status === 'CLOSED') issues.push({ rule: 'RETAILER_CLOSED', severity: 'WARNING', message: 'Retailer is marked CLOSED' });
    if (retailer.status === 'PROSPECT') issues.push({ rule: 'RETAILER_UNVERIFIED', severity: 'INFO', message: 'Retailer is a new, unverified prospect' });
    if (input.wholesalerOutletId) {
      const w = await this.prisma.outlet.findUnique({ where: { id: input.wholesalerOutletId } });
      if (!w || w.channel !== 'WHOLESALER') throw new BadRequestException({ code: 'INVALID_WHOLESALER', message: 'Wholesaler does not exist' });
      if (!retailer.retailerLinks.some((l) => l.wholesalerOutletId === w.id)) issues.push({ rule: 'UNLINKED_WHOLESALER', severity: 'WARNING', message: 'Retailer is not linked to this wholesaler' });
      if (w.assignedSpgId && w.assignedSpgId !== spgId) issues.push({ rule: 'WHOLESALER_NOT_ASSIGNED', severity: 'WARNING', message: 'Wholesaler is assigned to another SPG' });
    }
    const today = jakartaDate();
    if (input.transactionDate > today) throw new BadRequestException({ code: 'FUTURE_DATE', message: 'Transaction date is in the future' });
    const maxBack = await this.settings.get<number>('transactions.maxBackdateDays');
    if ((Date.parse(today) - Date.parse(input.transactionDate)) / 86400000 > maxBack) issues.push({ rule: 'BACKDATED', severity: 'WARNING', message: `Dated more than ${maxBack} days ago` });

    const variantIds = input.items.map((i) => i.productVariantId).filter(Boolean) as string[];
    const cpIds = input.items.map((i) => i.competitorProductId).filter(Boolean) as string[];
    const [variants, cps] = await Promise.all([
      this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } }),
      this.prisma.competitorProduct.findMany({ where: { id: { in: cpIds } } }),
    ]);
    const vmap = new Map(variants.map((v) => [v.id, v]));
    const deviation = await this.settings.get<number>('transactions.priceDeviationPct');
    input.items.forEach((it, idx) => {
      const line = idx + 1;
      if (it.productVariantId) {
        const v = vmap.get(it.productVariantId);
        if (!v) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: `Line ${line}: unknown SKU` });
        if (!v.isActive) issues.push({ rule: 'INACTIVE_SKU', severity: 'WARNING', message: `Line ${line}: SKU ${v.sku} is inactive`, line });
        if (it.unitPrice == null) issues.push({ rule: 'MISSING_PRICE', severity: 'WARNING', message: `Line ${line}: price missing`, line });
        else if (v.listPrice && Math.abs(it.unitPrice - Number(v.listPrice)) / Number(v.listPrice) * 100 > deviation) {
          issues.push({ rule: 'PRICE_OUTLIER', severity: 'WARNING', message: `Line ${line}: price deviates more than ${deviation}% from list price`, line });
        }
      }
      if (it.competitorProductId && !cps.some((c) => c.id === it.competitorProductId)) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: `Line ${line}: unknown competitor product` });
      if (it.productOwner === 'COMPETITOR' && !it.competitorProductId) issues.push({ rule: 'UNMAPPED_COMPETITOR_SKU', severity: 'INFO', message: `Line ${line}: competitor product not in master data`, line });
    });
    return { issues, retailer };
  }

  async create(input: CreateTxInput, ctx: CreateTxContext, tx?: Prisma.TransactionClient) {
    const replay = await (tx ?? this.prisma).retailerTransaction.findUnique({ where: { clientId: input.clientId }, include });
    if (replay) { if (replay.spgId !== ctx.spgId) throw new ForbiddenException(); return replay; }
    const { issues } = await this.validate(input, ctx.spgId);

    // Duplicate classification against same retailer & date (excluding rejected/superseded/reversed).
    const sig = lineSignature(input.items);
    const lines = input.items.map((it, i) => ({ ...it, lineNo: i + 1, lineTotal: it.unitPrice == null ? null : Math.round(it.quantity * it.unitPrice * 100) / 100 }));
    const totalValue = lines.reduce((a, l) => a + (l.lineTotal ?? 0), 0);
    const totalQuantity = lines.reduce((a, l) => a + l.quantity, 0);
    const sameDay = await this.prisma.retailerTransaction.findMany({
      where: { retailerOutletId: input.retailerOutletId, transactionDate: toDate(input.transactionDate), validationStatus: { notIn: ['REJECTED', 'SUPERSEDED', 'REVERSED'] } },
      include: { items: true },
    });
    const dup = classifyDuplicate({ signature: sig, totalValue }, sameDay.filter((t) => t.id !== input.correctionOf).map((t) => ({ id: t.id, signature: lineSignature(t.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitPrice: i.unitPrice == null ? null : Number(i.unitPrice) }))), totalValue: Number(t.totalValue), sameSpg: t.spgId === ctx.spgId })));
    if (dup.type === 'EXACT_DUPLICATE') issues.push({ rule: 'EXACT_DUPLICATE', severity: 'CRITICAL', message: 'Identical transaction already recorded' });
    if (dup.type === 'POTENTIAL_DUPLICATE') issues.push({ rule: 'POTENTIAL_DUPLICATE', severity: 'WARNING', message: 'Similar transaction already recorded for this retailer and date' });
    const result = outcome(issues);

    const run = async (t: Prisma.TransactionClient) => {
      const seq = await t.$queryRaw<{ n: bigint }[]>`SELECT nextval('retailer_tx_no_seq') AS n`;
      const created = await t.retailerTransaction.create({ data: {
        transactionNo: `TRX-${input.transactionDate.replace(/-/g, '').slice(2)}-${String(seq[0].n).padStart(6, '0')}`,
        clientId: input.clientId, retailerOutletId: input.retailerOutletId, wholesalerOutletId: input.wholesalerOutletId, spgId: ctx.spgId, visitId: input.visitId,
        transactionDate: toDate(input.transactionDate), dataNature: input.dataNature, source: ctx.source, fileLogId: ctx.fileLogId, evidenceFileId: input.evidenceFileId,
        totalQuantity, totalValue, validationStatus: ctx.forceStatus ?? result.status, validationIssues: issues as unknown as Prisma.InputJsonValue,
        duplicateType: input.correctionOf ? 'CORRECTED_SUBMISSION' : dup.type, duplicateOfId: dup.ofId, correctionOfId: input.correctionOf ?? null, correctionReason: input.correctionReason,
        notes: input.notes, clientRecordedAt: input.clientRecordedAt ? new Date(input.clientRecordedAt) : null, createdById: ctx.createdById,
        items: { create: lines.map((l) => ({ lineNo: l.lineNo, productOwner: l.productOwner, productVariantId: l.productVariantId, competitorProductId: l.competitorProductId,
          brandText: l.brandText, skuText: l.skuText, productText: l.productText, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
      }, include });
      await this.audit.log({ actorId: ctx.createdById, action: 'CREATE', entityType: 'RetailerTransaction', entityId: created.id, after: { transactionNo: created.transactionNo, totalValue, status: created.validationStatus, issues } }, t);
      return created;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async list(user: AuthUser, q: z.infer<typeof txListQuery>) {
    const scoped = q.mine === 'true' || !user.permissions.includes(PERMISSIONS.TRANSACTION_READ) ? { spgId: user.spgId ?? '00000000-0000-0000-0000-000000000000' } : await this.scope.spgIdFilter(user);
    const where: Prisma.RetailerTransactionWhereInput = { AND: [scoped,
      q.spgId ? { spgId: q.spgId } : {}, q.retailerId ? { retailerOutletId: q.retailerId } : {}, q.wholesalerId ? { wholesalerOutletId: q.wholesalerId } : {},
      q.status ? { validationStatus: q.status } : {}, q.dataNature ? { dataNature: q.dataNature } : {}, q.duplicateType ? { duplicateType: q.duplicateType } : {}, q.source ? { source: q.source } : {},
      q.from || q.to ? { transactionDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {},
      q.q ? { OR: [{ transactionNo: { contains: q.q, mode: 'insensitive' } }, { retailer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.retailerTransaction.findMany({ where, include, ...pageArgs(q), orderBy: orderBy(q.sort, ['transactionDate', 'totalValue', 'createdAt', 'transactionNo'], { createdAt: 'desc' }) }),
      this.prisma.retailerTransaction.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async get(user: AuthUser, id: string) {
    const t = await this.prisma.retailerTransaction.findUnique({ where: { id }, include });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    const allowed = user.permissions.includes(PERMISSIONS.TRANSACTION_READ) ? await this.scope.canAccessSpg(user, t.spgId) : t.spgId === user.spgId;
    if (!allowed) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
    const [corrections, audit] = await Promise.all([
      this.prisma.retailerTransaction.findMany({ where: { OR: [{ correctionOfId: id }, { id: t.correctionOfId ?? undefined }] }, select: { id: true, transactionNo: true, validationStatus: true, createdAt: true, correctionOfId: true } }),
      this.prisma.auditLog.findMany({ where: { entityType: 'RetailerTransaction', entityId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { ...t, related: corrections, auditTrail: audit };
  }

  async decide(user: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', note?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.retailerTransaction.findUnique({ where: { id } });
      if (!t || !(await this.scope.canAccessSpg(user, t.spgId))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transaction not found' });
      if (!['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'].includes(t.validationStatus)) throw new ConflictException({ code: 'NOT_REVIEWABLE', message: `Transaction is ${t.validationStatus}` });
      if (t.spgId === user.spgId || t.createdById === user.id) throw new ForbiddenException({ code: 'MAKER_CHECKER', message: 'You cannot approve your own transaction' });
      if (decision === 'APPROVED' && t.duplicateType === 'EXACT_DUPLICATE' && !note) throw new BadRequestException({ code: 'NOTE_REQUIRED', message: 'Approving an exact duplicate requires a justification note' });
      const after = await tx.retailerTransaction.update({ where: { id }, data: { validationStatus: decision, approvedById: user.id, approvedAt: new Date(), version: { increment: 1 } } });
      // Approving a correction supersedes the original (raw original is preserved, never edited).
      if (decision === 'APPROVED' && t.correctionOfId) {
        await tx.retailerTransaction.update({ where: { id: t.correctionOfId }, data: { validationStatus: 'SUPERSEDED', version: { increment: 1 } } });
        await this.audit.log({ actorId: user.id, action: 'SUPERSEDE', entityType: 'RetailerTransaction', entityId: t.correctionOfId, after: { supersededBy: id } }, tx);
      }
      await this.audit.log({ actorId: user.id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', entityType: 'RetailerTransaction', entityId: id,
        before: { validationStatus: t.validationStatus }, after: { validationStatus: after.validationStatus }, reason: note }, tx);
      return after;
    });
  }

  /** Correction = new record referencing the original. The original is never modified (brief §G, §L). */
  async correct(user: AuthUser, id: string, input: z.infer<typeof transactionCorrectionSchema>) {
    const orig = await this.get(user, id);
    if (['REJECTED', 'SUPERSEDED', 'REVERSED'].includes(orig.validationStatus)) throw new ConflictException({ code: 'NOT_CORRECTABLE', message: `Transaction is ${orig.validationStatus}` });
    const pending = await this.prisma.retailerTransaction.findFirst({ where: { correctionOfId: id, validationStatus: { in: ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'] } } });
    if (pending) throw new ConflictException({ code: 'CORRECTION_PENDING', message: `Correction ${pending.transactionNo} is already pending` });
    return this.create({
      clientId: input.clientId, retailerOutletId: orig.retailerOutletId, wholesalerOutletId: input.wholesalerOutletId !== undefined ? input.wholesalerOutletId : orig.wholesalerOutletId,
      visitId: orig.visitId, transactionDate: input.transactionDate ?? orig.transactionDate.toISOString().slice(0, 10), dataNature: input.dataNature ?? orig.dataNature,
      evidenceFileId: orig.evidenceFileId, notes: orig.notes, items: input.items, clientRecordedAt: undefined, correctionOf: id, correctionReason: input.reason,
    }, { spgId: orig.spgId, createdById: user.id, source: 'MANUAL' });
  }

  async requestReversal(user: AuthUser, id: string, reason: string) {
    const t = await this.get(user, id);
    if (t.validationStatus !== 'APPROVED') throw new ConflictException({ code: 'NOT_APPROVED', message: 'Only approved transactions can be reversed; reject or correct others' });
    return this.approvals.request(user, { entityType: 'RetailerTransaction', entityId: id, requestType: 'REVERSAL', reason, originalSnapshot: { transactionNo: t.transactionNo, totalValue: t.totalValue, items: t.items } });
  }
}

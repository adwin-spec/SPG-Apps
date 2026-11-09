import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { horecaProgramSchema, horecaSaleSchema, horecaVisitDetailSchema, paginationQuery, posmRecordSchema, programImplementationSchema, PERMISSIONS, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { FieldRecordsService } from '../common/field-records.service';
import { requireSpg } from '../common/field-guard';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const horecaListQuery = paginationQuery.extend({ from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), outletId: z.uuid().optional(),
  status: z.enum(['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVERSED']).optional(), mine: z.enum(['true', 'false']).optional() });

@Injectable()
export class HorecaService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly field: FieldRecordsService) {}

  private source(c?: string) { return c && Date.now() - Date.parse(c) > 300000 ? 'OFFLINE_SYNC' as const : 'MANUAL' as const; }

  async visitDetail(user: AuthUser, input: z.infer<typeof horecaVisitDetailSchema>) {
    const spgId = requireSpg(user);
    const v = await this.field.visitFor(spgId, input.visitId);
    if (!v || v.channel !== 'HORECA') throw new BadRequestException({ code: 'NOT_HORECA_VISIT', message: 'Visit is not a HORECA visit' });
    const { visitId, nextFollowUpDate, ...data } = input;
    const d = { ...data, nextFollowUpDate: nextFollowUpDate ? toDate(nextFollowUpDate) : null };
    return this.prisma.horecaVisit.upsert({ where: { visitId }, create: { visitId, ...d }, update: d });
  }

  /** Sale/order line. Repeat order = outlet already had an earlier order of the same SKU. */
  async sale(user: AuthUser, input: z.infer<typeof horecaSaleSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.horecaSale.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    await this.field.outletFor(user, input.outletId, ['HORECA']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.saleDate);
    const v = await this.prisma.productVariant.findUnique({ where: { id: input.productVariantId } });
    if (!v || !v.isActive) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Unknown or inactive SKU' });
    const prior = input.isOrder ? await this.prisma.horecaSale.count({ where: { outletId: input.outletId, productVariantId: input.productVariantId, isOrder: true, saleDate: { lt: toDate(input.saleDate) }, validationStatus: { notIn: ['REJECTED', 'SUPERSEDED', 'REVERSED'] } } }) : 0;
    const issues = input.unitPrice == null ? ['MISSING_PRICE'] : [];
    const { clientRecordedAt, ...data } = input;
    return this.prisma.horecaSale.create({ data: { ...data, spgId, saleDate: toDate(input.saleDate), isRepeatOrder: prior > 0,
      salesValue: input.unitPrice == null ? null : Math.round(input.quantity * input.unitPrice * 100) / 100,
      validationStatus: issues.length ? 'NEEDS_REVIEW' : 'VALIDATED' } });
  }

  async sales(user: AuthUser, q: z.infer<typeof horecaListQuery>) {
    const scoped = q.mine === 'true' || !user.permissions.includes(PERMISSIONS.TRANSACTION_READ) ? { spgId: requireSpg(user) } : await this.scope.spgIdFilter(user);
    const where: Prisma.HorecaSaleWhereInput = { AND: [scoped, q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {}, q.status ? { validationStatus: q.status } : {},
      q.from || q.to ? { saleDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.horecaSale.findMany({ where, include: { outlet: { select: { name: true, code: true } }, productVariant: { select: { sku: true, name: true } }, spg: { select: { fullName: true } } }, orderBy: { saleDate: 'desc' }, ...pageArgs(q) }),
      this.prisma.horecaSale.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async posm(user: AuthUser, input: z.infer<typeof posmRecordSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.posmRecord.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    const o = await this.field.outletFor(user, input.outletId, ['HORECA', 'REGULAR']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.recordDate);
    await this.field.ownFile(user.id, input.photoFileId);
    const { clientRecordedAt, ...data } = input;
    // Installed POSM without photo evidence cannot be verified ⇒ review
    const status = input.status === 'INSTALLED' && !input.photoFileId ? 'NEEDS_REVIEW' : 'VALIDATED';
    return this.prisma.posmRecord.create({ data: { ...data, spgId, channel: o.channel, recordDate: toDate(input.recordDate), validationStatus: status } });
  }

  // ── Programs ─────────────────────────────
  programs() { return this.prisma.horecaProgram.findMany({ orderBy: { startDate: 'desc' }, include: { _count: { select: { implementations: true } } } }); }

  async createProgram(user: AuthUser, input: z.infer<typeof horecaProgramSchema>) {
    if (input.endDate && input.endDate < input.startDate) throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'End date precedes start date' });
    const p = await this.prisma.horecaProgram.create({ data: { ...input, startDate: toDate(input.startDate), endDate: input.endDate ? toDate(input.endDate) : null, createdById: user.id } });
    await this.audit.log({ actorId: user.id, action: 'CREATE', entityType: 'HorecaProgram', entityId: p.id, after: p });
    return p;
  }

  async updateProgramStatus(user: AuthUser, id: string, status: 'DRAFT' | 'ACTIVE' | 'CLOSED') {
    const before = await this.prisma.horecaProgram.findUniqueOrThrow({ where: { id } });
    const p = await this.prisma.horecaProgram.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId: user.id, action: 'UPDATE_STATUS', entityType: 'HorecaProgram', entityId: id, before: { status: before.status }, after: { status } });
    return p;
  }

  async implement(user: AuthUser, input: z.infer<typeof programImplementationSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.horecaProgramImplementation.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    await this.field.outletFor(user, input.outletId, ['HORECA']);
    await this.field.visitFor(spgId, input.visitId, input.outletId);
    this.field.assertNotFuture(input.implementationDate);
    await this.field.ownFile(user.id, input.photoFileId);
    const program = await this.prisma.horecaProgram.findUnique({ where: { id: input.programId } });
    if (!program) throw new BadRequestException({ code: 'INVALID_PROGRAM', message: 'Program not found' });
    if (program.status !== 'ACTIVE') throw new ConflictException({ code: 'PROGRAM_NOT_ACTIVE', message: 'Program is not active' });
    const { clientRecordedAt, ...data } = input;
    const status = input.status === 'EXECUTED' && !input.photoFileId ? 'NEEDS_REVIEW' : 'VALIDATED';
    return this.prisma.horecaProgramImplementation.create({ data: { ...data, spgId, implementationDate: toDate(input.implementationDate), validationStatus: status } });
  }

  /** Program realisation & effectiveness: execution rate, cost vs budget, sales of executed outlets before/after. */
  async programPerformance(user: AuthUser, id: string) {
    const scoped = await this.scope.spgIdList(user);
    const p = await this.prisma.horecaProgram.findUniqueOrThrow({ where: { id } });
    const impl = await this.prisma.horecaProgramImplementation.findMany({ where: { programId: id, ...(scoped ? { spgId: { in: scoped } } : {}), validationStatus: { notIn: ['REJECTED', 'SUPERSEDED', 'REVERSED'] } },
      include: { outlet: { select: { name: true, code: true } }, spg: { select: { fullName: true } } }, orderBy: { implementationDate: 'desc' } });
    const byStatus = impl.reduce<Record<string, number>>((a, i) => ({ ...a, [i.status]: (a[i.status] ?? 0) + 1 }), {});
    const cost = impl.reduce((a, i) => a + Number(i.actualCost ?? 0), 0);
    const executedOutlets = [...new Set(impl.filter((i) => i.status === 'EXECUTED').map((i) => i.outletId))];
    const effect = executedOutlets.length ? await this.prisma.$queryRaw<{ phase: string; value: number }[]>`
      SELECT CASE WHEN s.sale_date < ${p.startDate}::date THEN 'before' ELSE 'during' END AS phase, COALESCE(sum(s.sales_value), 0)::float AS value
      FROM horeca_sales s WHERE s.outlet_id IN (${Prisma.join(executedOutlets.map((o) => Prisma.sql`${o}::uuid`))})
        AND s.validation_status = 'APPROVED' AND s.data_nature = 'ACTUAL'
        AND s.sale_date BETWEEN (${p.startDate}::date - interval '30 days') AND COALESCE(${p.endDate}::date, current_date)
      GROUP BY 1` : [];
    return { program: p, implementations: impl, summary: { total: impl.length, byStatus, actualCost: cost, budget: p.budget ? Number(p.budget) : null,
      budgetUtilisationPct: p.budget && Number(p.budget) > 0 ? Math.round((cost / Number(p.budget)) * 10000) / 100 : null, executedOutlets: executedOutlets.length, salesEffect: effect,
      note: 'Sales effect compares approved sales of executed outlets 30 days before program start vs. during the program; it is indicative, not causal.' } };
  }
}

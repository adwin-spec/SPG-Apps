import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, paginationQuery, recordDecisionSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { AuditService } from '../common/audit/audit.service';
import { Paginated, pageArgs } from '../common/http/paginated';

/** Record types reviewed through the generic queue (retailer transactions have their own workflow). */
const TYPES = {
  'horeca-sales': { model: 'horecaSale', entity: 'HorecaSale', date: 'saleDate', approvedFields: true },
  'outlet-orders': { model: 'outletOrder', entity: 'OutletOrder', date: 'orderDate', approvedFields: true },
  'availability': { model: 'availabilityRecord', entity: 'AvailabilityRecord', date: 'recordDate', approvedFields: false },
  'visibility': { model: 'visibilityRecord', entity: 'VisibilityRecord', date: 'recordDate', approvedFields: false },
  'posm': { model: 'posmRecord', entity: 'PosmRecord', date: 'recordDate', approvedFields: false },
  'competitor-observations': { model: 'competitorObservation', entity: 'CompetitorObservation', date: 'observationDate', approvedFields: false },
  'program-implementations': { model: 'horecaProgramImplementation', entity: 'HorecaProgramImplementation', date: 'implementationDate', approvedFields: false },
  'visits': { model: 'visit', entity: 'Visit', date: 'visitDate', approvedFields: false },
} as const;
type TypeKey = keyof typeof TYPES;
const typeParam = z.enum(Object.keys(TYPES) as [TypeKey, ...TypeKey[]]);
const queueQuery = paginationQuery.extend({ status: z.enum(['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW']).optional(), spgId: z.uuid().optional() });
type Delegate = { findMany: Function; count: Function; findMany_: never; updateMany: Function };

@ApiTags('Review Queue')
@ApiBearerAuth()
@Controller('review-queue')
export class ReviewController {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly audit: AuditService) {}
  private d(t: TypeKey) { return (this.prisma as unknown as Record<string, Delegate>)[TYPES[t].model]; }

  @Get('summary') @RequirePermissions(PERMISSIONS.TRANSACTION_APPROVE)
  async summary(@CurrentUser() u: AuthUser) {
    const scoped = await this.scope.spgIdFilter(u);
    const out: Record<string, number> = {
      'retailer-transactions': await this.prisma.retailerTransaction.count({ where: { ...scoped, validationStatus: { in: ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'] } } }),
    };
    for (const t of Object.keys(TYPES) as TypeKey[]) out[t] = await this.d(t).count({ where: { ...scoped, validationStatus: { in: ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'] } } });
    return out;
  }

  @Get(':type') @RequirePermissions(PERMISSIONS.TRANSACTION_APPROVE)
  async list(@Param('type', new ZodPipe(typeParam)) type: TypeKey, @Query(new ZodPipe(queueQuery)) q: z.infer<typeof queueQuery>, @CurrentUser() u: AuthUser) {
    const where = { AND: [await this.scope.spgIdFilter(u), q.spgId ? { spgId: q.spgId } : {}, { validationStatus: q.status ? q.status : { in: ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'] } }] };
    const [items, total] = await Promise.all([
      this.d(type).findMany({ where, include: { spg: { select: { fullName: true } }, outlet: { select: { name: true, code: true } } }, orderBy: { [TYPES[type].date]: 'asc' }, ...pageArgs(q) }),
      this.d(type).count({ where }),
    ]);
    return new Paginated(items as unknown[], total as number, q.page, q.pageSize);
  }

  @Post(':type/decision') @HttpCode(200) @RequirePermissions(PERMISSIONS.TRANSACTION_APPROVE) @ApiZodBody(recordDecisionSchema)
  async decide(@Param('type', new ZodPipe(typeParam)) type: TypeKey, @Body(new ZodPipe(recordDecisionSchema)) b: z.infer<typeof recordDecisionSchema>, @CurrentUser() u: AuthUser) {
    const scoped = await this.scope.spgIdFilter(u);
    const rows = (await this.d(type).findMany({ where: { id: { in: b.ids } }, select: { id: true, spgId: true, validationStatus: true } })) as { id: string; spgId: string; validationStatus: string }[];
    if (rows.length !== b.ids.length) throw new ConflictException({ code: 'NOT_FOUND', message: 'Some records do not exist' });
    if (scoped.spgId && rows.some((r) => !scoped.spgId!.in.includes(r.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'Some records are outside your scope' });
    if (u.spgId && rows.some((r) => r.spgId === u.spgId)) throw new ForbiddenException({ code: 'MAKER_CHECKER', message: 'You cannot approve your own records' });
    const reviewable = rows.filter((r) => ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'].includes(r.validationStatus)).map((r) => r.id);
    await this.prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { validationStatus: b.decision };
      if (TYPES[type].approvedFields) Object.assign(data, { approvedById: u.id, approvedAt: new Date() });
      await (tx as unknown as Record<string, Delegate>)[TYPES[type].model].updateMany({ where: { id: { in: reviewable } }, data });
      for (const id of reviewable) await this.audit.log({ actorId: u.id, action: b.decision === 'APPROVED' ? 'APPROVE' : 'REJECT', entityType: TYPES[type].entity, entityId: id, after: { validationStatus: b.decision }, reason: b.note }, tx);
    });
    return { decided: reviewable.length, skipped: b.ids.length - reviewable.length };
  }
}

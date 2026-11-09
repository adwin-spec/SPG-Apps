import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { paginationQuery, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { AuditService } from '../common/audit/audit.service';
import { Paginated, pageArgs } from '../common/http/paginated';

export type ApprovalHandler = (tx: Prisma.TransactionClient, approval: { id: string; entityId: string; proposedChange: unknown; reason: string }, actor: AuthUser) => Promise<string | void>;

export const approvalListQuery = paginationQuery.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), entityType: z.string().max(60).optional() });

/**
 * Generic maker–checker workflow (reversals, overrides, master-data changes).
 * Modules register a handler per `entityType:requestType` that applies the change on approval.
 */
@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<string, ApprovalHandler>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  register(entityType: string, requestType: string, handler: ApprovalHandler) { this.handlers.set(`${entityType}:${requestType}`, handler); }

  async request(actor: AuthUser, input: { entityType: string; entityId: string; requestType: string; reason: string; originalSnapshot?: unknown; proposedChange?: unknown }, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const pending = await tx.approval.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, requestType: input.requestType, status: 'PENDING' } });
    if (pending) throw new ConflictException({ code: 'APPROVAL_ALREADY_PENDING', message: 'A request for this record is already pending', details: { approvalId: pending.id } });
    const a = await tx.approval.create({ data: { entityType: input.entityType, entityId: input.entityId, requestType: input.requestType, reason: input.reason, requestedById: actor.id,
      originalSnapshot: input.originalSnapshot as Prisma.InputJsonValue, proposedChange: input.proposedChange as Prisma.InputJsonValue } });
    await this.audit.log({ actorId: actor.id, action: 'APPROVAL_REQUESTED', entityType: input.entityType, entityId: input.entityId, after: { approvalId: a.id, requestType: input.requestType }, reason: input.reason }, tx);
    return a;
  }

  /** Row scope: an approval is visible when its record belongs to an SPG in scope, or the user requested it. */
  private async scopeWhere(user: AuthUser): Promise<Prisma.ApprovalWhereInput> {
    const s = await this.scope.spgScope(user);
    if (s.all) return {};
    const txIds = (await this.prisma.retailerTransaction.findMany({ where: { spgId: { in: s.spgIds } }, select: { id: true } })).map((t) => t.id);
    return { OR: [{ requestedById: user.id }, { entityType: 'RetailerTransaction', entityId: { in: txIds } }, { entityType: 'Spg', entityId: { in: s.spgIds } }] };
  }

  async list(user: AuthUser, q: z.infer<typeof approvalListQuery>) {
    const where: Prisma.ApprovalWhereInput = { AND: [await this.scopeWhere(user), { ...(q.status ? { status: q.status } : {}), ...(q.entityType ? { entityType: q.entityType } : {}) }] };
    const [items, total] = await Promise.all([this.prisma.approval.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }), this.prisma.approval.count({ where })]);
    const userIds = [...new Set(items.flatMap((i) => [i.requestedById, i.decidedById]).filter(Boolean) as string[])];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
    return new Paginated(items.map((i) => ({ ...i, requestedBy: users.get(i.requestedById), decidedBy: i.decidedById ? users.get(i.decidedById) : null })), total, q.page, q.pageSize);
  }

  async decide(actor: AuthUser, id: string, decision: 'APPROVED' | 'REJECTED', note?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.approval.findUnique({ where: { id } });
      if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval not found' });
      if (a.status !== 'PENDING') throw new ConflictException({ code: 'ALREADY_DECIDED', message: `Approval is ${a.status}` });
      if (a.requestedById === actor.id) throw new ForbiddenException({ code: 'MAKER_CHECKER', message: 'Requester cannot approve their own request' });
      if (!(await tx.approval.count({ where: { AND: [{ id }, await this.scopeWhere(actor)] } }))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Approval not found' });
      let resultEntityId: string | null = null;
      if (decision === 'APPROVED') {
        const h = this.handlers.get(`${a.entityType}:${a.requestType}`);
        if (!h) throw new ConflictException({ code: 'NO_HANDLER', message: `No handler for ${a.entityType}:${a.requestType}` });
        resultEntityId = (await h(tx, { id: a.id, entityId: a.entityId, proposedChange: a.proposedChange, reason: a.reason }, actor)) ?? null;
      }
      const updated = await tx.approval.update({ where: { id }, data: { status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: note, resultEntityId } });
      await this.audit.log({ actorId: actor.id, action: `APPROVAL_${decision}`, entityType: a.entityType, entityId: a.entityId, after: { approvalId: id, requestType: a.requestType }, reason: note }, tx);
      return updated;
    });
  }
}

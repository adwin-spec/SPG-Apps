import { Injectable } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

type Tx = Prisma.TransactionClient | PrismaService;

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as Prisma.InputJsonValue));

/** Append-only audit trail (table protected by DB trigger). Pass `tx` to keep audit atomic with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async log(e: AuditEntry, tx: Tx = this.prisma) {
    await tx.auditLog.create({ data: {
      actorId: e.actorId ?? null, action: e.action, entityType: e.entityType, entityId: e.entityId ?? null,
      before: json(e.before), after: json(e.after), reason: e.reason ?? null, ip: e.ip ?? null, userAgent: e.userAgent?.slice(0, 300) ?? null,
    } });
  }
}

/** Returns only the fields that changed (before/after) for compact audit rows. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}; const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const bv = before[k]; const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) { b[k] = bv; a[k] = av; }
  }
  return { before: b, after: a };
}

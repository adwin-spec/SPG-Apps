import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@tanda/database';
import { PERMISSIONS, paginationQuery } from '@tanda/shared';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { Paginated, pageArgs } from '../common/http/paginated';

const auditQuery = paginationQuery.extend({ entityType: z.string().max(60).optional(), entityId: z.string().max(64).optional(), actorId: z.uuid().optional(), action: z.string().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    const where: Prisma.AuditLogWhereInput = { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}), ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+07:00`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 86400000) } : {}) } } : {}) };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }), this.prisma.auditLog.count({ where })]);
    const actors = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.actorId).filter(Boolean) as string[])] } }, select: { id: true, fullName: true, email: true } })).map((u) => [u.id, u]));
    return new Paginated(items.map((i) => ({ ...i, actor: i.actorId ? actors.get(i.actorId) ?? null : null })), total, q.page, q.pageSize);
  }
}

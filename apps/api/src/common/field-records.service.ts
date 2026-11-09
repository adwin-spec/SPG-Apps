import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Outlet, OutletChannel } from '@tanda/database';
import { jakartaDate, type AuthUser } from '@tanda/shared';
import { PrismaService } from './prisma/prisma.service';
import { ScopeService } from './scope/scope.service';
import { assertChannel } from './field-guard';

/** Shared checks for every SPG field record (outlet scope, channel, visit ownership, date sanity). */
@Injectable()
export class FieldRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService) {}

  async outletFor(user: AuthUser, outletId: string, channels?: OutletChannel[]): Promise<Outlet> {
    const o = await this.prisma.outlet.findFirst({ where: { AND: [{ id: outletId }, await this.scope.outletFilter(user)] } });
    if (!o) throw new NotFoundException({ code: 'OUTLET_NOT_FOUND', message: 'Outlet not found or outside your area' });
    if (channels && !channels.includes(o.channel)) throw new BadRequestException({ code: 'WRONG_OUTLET_CHANNEL', message: `Outlet must be ${channels.join(' or ')}` });
    assertChannel(user, o.channel);
    return o;
  }

  async visitFor(spgId: string, visitId: string | null | undefined, outletId?: string) {
    if (!visitId) return null;
    const v = await this.prisma.visit.findFirst({ where: { id: visitId, spgId } });
    if (!v) throw new BadRequestException({ code: 'INVALID_VISIT', message: 'Visit not found for this SPG' });
    if (outletId && v.outletId !== outletId) throw new BadRequestException({ code: 'VISIT_OUTLET_MISMATCH', message: 'Visit belongs to a different outlet' });
    return v;
  }

  assertNotFuture(date: string) {
    if (date > jakartaDate()) throw new BadRequestException({ code: 'FUTURE_DATE', message: 'Date cannot be in the future' });
  }

  async ownFile(userId: string, fileId: string | null | undefined) {
    if (!fileId) return;
    const f = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!f || f.uploadedById !== userId) throw new BadRequestException({ code: 'INVALID_FILE', message: 'Photo not found or not uploaded by you' });
  }
}

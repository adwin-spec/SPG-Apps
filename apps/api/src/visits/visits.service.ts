import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { evaluateGeofence, jakartaDate, paginationQuery, visitCheckInSchema, visitCheckOutSchema, visitEvidenceSchema, visitOverrideSchema, visitPlanSchema, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';
import { assertChannel, requireSpg, resolveClientTime } from '../common/field-guard';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const visitListQuery = paginationQuery.extend({
  from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), outletId: z.uuid().optional(),
  channel: z.enum(['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR']).optional(), status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  geofenceStatus: z.enum(['INSIDE', 'OUTSIDE', 'UNKNOWN']).optional(), mine: z.enum(['true', 'false']).optional(),
});
export const planListQuery = z.object({ date: dateStr.optional(), from: dateStr.optional(), to: dateStr.optional(), spgId: z.uuid().optional(), status: z.enum(['PLANNED', 'VISITED', 'MISSED', 'CANCELLED']).optional() });

const listInclude = {
  spg: { select: { id: true, fullName: true, employeeCode: true } },
  outlet: { select: { id: true, name: true, code: true, channel: true } },
} satisfies Prisma.VisitInclude;

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService, private readonly settings: SettingsService) {}

  async checkIn(user: AuthUser, input: z.infer<typeof visitCheckInSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.visit.findUnique({ where: { clientId: input.clientId }, include: listInclude });
    if (replay) { if (replay.spgId !== spgId) throw new ForbiddenException(); return replay; }

    const outlet = await this.prisma.outlet.findFirst({ where: { AND: [{ id: input.outletId }, await this.scope.outletFilter(user)] } });
    if (!outlet) throw new NotFoundException({ code: 'OUTLET_NOT_FOUND', message: 'Outlet not found or outside your area' });
    if (outlet.status === 'CLOSED') throw new UnprocessableEntityException({ code: 'OUTLET_CLOSED', message: 'Outlet is closed' });
    assertChannel(user, outlet.channel);

    const { at, workDate, skewed } = resolveClientTime(input.clientRecordedAt, await this.settings.get<number>('sync.maxClientClockSkewMin'));
    if (await this.settings.get<boolean>('visits.requireAttendance')) {
      const att = await this.prisma.attendance.findUnique({ where: { spgId_workDate: { spgId, workDate: toDate(workDate) } } });
      if (!att) throw new ConflictException({ code: 'ATTENDANCE_REQUIRED', message: 'Check in attendance before visiting outlets' });
    }
    const open = await this.prisma.visit.findFirst({ where: { spgId, status: 'IN_PROGRESS' }, select: { id: true, outlet: { select: { name: true } } } });
    if (open) throw new ConflictException({ code: 'VISIT_IN_PROGRESS', message: `Finish your visit at ${open.outlet.name} first`, details: { visitId: open.id } });

    const radius = outlet.geofenceRadiusM ?? (await this.settings.get<number>('attendance.defaultGeofenceRadiusM'));
    const maxAcc = await this.settings.get<number>('attendance.maxGpsAccuracyM');
    const geo = evaluateGeofence({ lat: input.gps?.lat, lng: input.gps?.lng, accuracyM: input.gps?.accuracyM },
      { lat: outlet.latitude ? Number(outlet.latitude) : null, lng: outlet.longitude ? Number(outlet.longitude) : null }, radius, maxAcc);
    const policy = await this.settings.get<'FLAG' | 'BLOCK'>('attendance.outsideGeofencePolicy');
    if (geo.status === 'OUTSIDE' && policy === 'BLOCK') {
      throw new UnprocessableEntityException({ code: 'OUTSIDE_GEOFENCE', message: `You are ${geo.distanceM} m from the outlet (limit ${radius} m)`, details: geo });
    }
    const plan = input.visitPlanId
      ? await this.prisma.visitPlan.findFirst({ where: { id: input.visitPlanId, spgId } })
      : await this.prisma.visitPlan.findFirst({ where: { spgId, outletId: outlet.id, plannedDate: toDate(workDate), status: 'PLANNED' } });

    return this.prisma.$transaction(async (tx) => {
      const v = await tx.visit.create({ data: {
        clientId: input.clientId, spgId, outletId: outlet.id, channel: outlet.channel, visitPlanId: plan?.id, isPlanned: !!plan,
        visitDate: toDate(workDate), checkInAt: at, checkInLat: input.gps?.lat, checkInLng: input.gps?.lng, checkInAccuracyM: input.gps?.accuracyM ?? null,
        checkInDistanceM: geo.distanceM, geofenceStatus: geo.status, purpose: input.purpose,
        clientRecordedAt: input.clientRecordedAt ? new Date(input.clientRecordedAt) : null,
        source: input.clientRecordedAt && Date.now() - new Date(input.clientRecordedAt).getTime() > 5 * 60000 ? 'OFFLINE_SYNC' : 'MANUAL',
        // Outside geofence / skewed clock ⇒ needs supervisor review (never silently accepted)
        validationStatus: geo.status === 'OUTSIDE' || skewed ? 'NEEDS_REVIEW' : 'SUBMITTED',
        notes: skewed ? '[device clock skew detected]' : null,
      }, include: listInclude });
      if (plan) await tx.visitPlan.update({ where: { id: plan.id }, data: { status: 'VISITED' } });
      return { ...v, geofence: geo };
    });
  }

  async checkOut(user: AuthUser, id: string, input: z.infer<typeof visitCheckOutSchema>) {
    const spgId = requireSpg(user);
    const v = await this.prisma.visit.findFirst({ where: { id, spgId } });
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Visit not found' });
    if (v.status === 'COMPLETED') return v; // idempotent replay
    if (v.status !== 'IN_PROGRESS') throw new ConflictException({ code: 'VISIT_NOT_OPEN', message: `Visit is ${v.status}` });
    const { at } = resolveClientTime(input.clientRecordedAt, await this.settings.get<number>('sync.maxClientClockSkewMin'));
    if (at < v.checkInAt) throw new UnprocessableEntityException({ code: 'CHECKOUT_BEFORE_CHECKIN', message: 'Check-out precedes check-in' });
    const durationMin = Math.round((at.getTime() - v.checkInAt.getTime()) / 60000);
    return this.prisma.visit.update({ where: { id }, data: {
      status: 'COMPLETED', checkOutAt: at, checkOutLat: input.gps?.lat, checkOutLng: input.gps?.lng, durationMin,
      outcome: input.outcome, notes: [v.notes, input.notes].filter(Boolean).join('\n') || null, picMet: input.picMet,
      followUpAction: input.followUpAction, orderStatus: input.orderStatus, version: { increment: 1 },
      validationStatus: v.validationStatus === 'SUBMITTED' ? 'VALIDATED' : v.validationStatus,
    }, include: listInclude });
  }

  async addEvidence(user: AuthUser, id: string, input: z.infer<typeof visitEvidenceSchema>) {
    const spgId = requireSpg(user);
    const v = await this.prisma.visit.findFirst({ where: { id, spgId } });
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Visit not found' });
    const f = await this.prisma.fileObject.findUnique({ where: { id: input.fileId } });
    if (!f || f.uploadedById !== user.id) throw new BadRequestException({ code: 'INVALID_FILE', message: 'File not found or not uploaded by you' });
    const dup = await this.prisma.visitEvidence.findFirst({ where: { visitId: id, fileId: input.fileId } });
    if (dup) return dup;
    return this.prisma.visitEvidence.create({ data: { visitId: id, fileId: input.fileId, evidenceType: input.evidenceType, caption: input.caption, latitude: input.gps?.lat, longitude: input.gps?.lng } });
  }

  async list(user: AuthUser, q: z.infer<typeof visitListQuery>) {
    const scoped = q.mine === 'true' ? { spgId: requireSpg(user) } : await this.scope.spgIdFilter(user);
    const where: Prisma.VisitWhereInput = { AND: [scoped,
      q.spgId ? { spgId: q.spgId } : {}, q.outletId ? { outletId: q.outletId } : {}, q.channel ? { channel: q.channel } : {},
      q.status ? { status: q.status } : {}, q.geofenceStatus ? { geofenceStatus: q.geofenceStatus } : {},
      q.from || q.to ? { visitDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.visit.findMany({ where, include: { ...listInclude, _count: { select: { evidence: true } } }, orderBy: { checkInAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.visit.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  /** Visit with every business record attached to it – the lowest drill-down level before transactions. */
  async get(user: AuthUser, id: string) {
    const scoped = await this.scope.spgIdFilter(user);
    const v = await this.prisma.visit.findFirst({ where: { AND: [{ id }, user.spgId && !user.permissions.includes('visit.read') ? { spgId: user.spgId } : scoped] },
      include: { ...listInclude, evidence: { include: { file: { select: { id: true, mimeType: true, originalName: true } } } }, horecaVisit: true, wholesaleReport: true, visitPlan: true } });
    if (!v) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Visit not found' });
    const [transactions, orders, horecaSales, competitorObservations, availability, visibility, posm, programs, wholesaleObservations] = await Promise.all([
      this.prisma.retailerTransaction.findMany({ where: { visitId: id }, include: { items: true, retailer: { select: { name: true, code: true } } } }),
      this.prisma.outletOrder.findMany({ where: { visitId: id }, include: { items: true } }),
      this.prisma.horecaSale.findMany({ where: { visitId: id }, include: { productVariant: { select: { sku: true, name: true } } } }),
      this.prisma.competitorObservation.findMany({ where: { visitId: id }, include: { brand: { select: { name: true } } } }),
      this.prisma.availabilityRecord.findMany({ where: { visitId: id }, include: { productVariant: { select: { sku: true, name: true } } } }),
      this.prisma.visibilityRecord.findMany({ where: { visitId: id } }),
      this.prisma.posmRecord.findMany({ where: { visitId: id } }),
      this.prisma.horecaProgramImplementation.findMany({ where: { visitId: id }, include: { program: { select: { name: true } } } }),
      this.prisma.wholesaleObservation.findMany({ where: { visitId: id }, include: { productVariant: { select: { sku: true, name: true } } } }),
    ]);
    return { ...v, records: { transactions, orders, horecaSales, competitorObservations, availability, visibility, posm, programs, wholesaleObservations } };
  }

  async override(user: AuthUser, id: string, input: z.infer<typeof visitOverrideSchema>) {
    const v = await this.prisma.visit.findUnique({ where: { id } });
    if (!v || !(await this.scope.canAccessSpg(user, v.spgId))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Visit not found' });
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.visit.update({ where: { id }, data: {
        ...(input.geofenceStatus ? { geofenceStatus: input.geofenceStatus } : {}), ...(input.status ? { status: input.status } : {}),
        overrideById: user.id, overrideReason: input.reason, validationStatus: 'APPROVED', version: { increment: 1 } } });
      await this.audit.log({ actorId: user.id, action: 'OVERRIDE', entityType: 'Visit', entityId: id,
        before: { geofenceStatus: v.geofenceStatus, status: v.status, validationStatus: v.validationStatus },
        after: { geofenceStatus: after.geofenceStatus, status: after.status, validationStatus: after.validationStatus }, reason: input.reason }, tx);
      return after;
    });
  }

  // ── Visit plans (planned vs actual) ─────────────────────
  async createPlans(user: AuthUser, input: z.infer<typeof visitPlanSchema>) {
    if (!(await this.scope.canAccessSpg(user, input.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG is outside your scope' });
    const r = await this.prisma.visitPlan.createMany({ data: input.items.map((i) => ({ spgId: input.spgId, outletId: i.outletId, plannedDate: toDate(i.plannedDate), note: i.note, createdById: user.id })), skipDuplicates: true });
    await this.audit.log({ actorId: user.id, action: 'CREATE_PLANS', entityType: 'VisitPlan', entityId: input.spgId, after: { count: r.count, items: input.items.length } });
    return { created: r.count, skippedDuplicates: input.items.length - r.count };
  }

  async plans(user: AuthUser, q: z.infer<typeof planListQuery>) {
    const scoped = user.spgId && !user.permissions.includes('visit.read') ? { spgId: user.spgId } : await this.scope.spgIdFilter(user);
    const from = q.date ?? q.from; const to = q.date ?? q.to;
    return this.prisma.visitPlan.findMany({
      where: { AND: [scoped, q.spgId ? { spgId: q.spgId } : {}, q.status ? { status: q.status } : {}, from || to ? { plannedDate: { ...(from ? { gte: toDate(from) } : {}), ...(to ? { lte: toDate(to) } : {}) } } : {}] },
      include: { outlet: { select: { id: true, name: true, code: true, channel: true, address: true, latitude: true, longitude: true } }, spg: { select: { fullName: true } } },
      orderBy: [{ plannedDate: 'asc' }, { outlet: { name: 'asc' } }], take: 1000,
    });
  }

  async cancelPlan(user: AuthUser, id: string, reason: string) {
    const p = await this.prisma.visitPlan.findUniqueOrThrow({ where: { id } });
    if (!(await this.scope.canAccessSpg(user, p.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'Out of scope' });
    if (p.status !== 'PLANNED') throw new ConflictException({ code: 'PLAN_NOT_OPEN', message: `Plan is ${p.status}` });
    const r = await this.prisma.visitPlan.update({ where: { id }, data: { status: 'CANCELLED', note: reason } });
    await this.audit.log({ actorId: user.id, action: 'CANCEL', entityType: 'VisitPlan', entityId: id, before: p, after: r, reason });
    return r;
  }

  /** Marks past PLANNED plans as MISSED (run daily by the worker; also callable on demand). */
  async markMissedPlans(today = jakartaDate()) {
    const r = await this.prisma.visitPlan.updateMany({ where: { status: 'PLANNED', plannedDate: { lt: toDate(today) } }, data: { status: 'MISSED' } });
    return r.count;
  }
}

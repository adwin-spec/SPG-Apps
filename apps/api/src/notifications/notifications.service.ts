import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { jakartaDate, ROLES, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';

interface Rule { roles: string[]; severity: 'INFO' | 'WARNING' | 'CRITICAL'; enabled: boolean; thresholdPct?: number; dropPoints?: number }
type Rules = Record<string, Rule>;

/**
 * In-app notifications routed by type → role → urgency from `notifications.rules` (configurable).
 * Every notification has a dedup key so scheduled scans never spam the same alert.
 * Email / WhatsApp providers can subscribe to the same events later (brief §N).
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  list(user: AuthUser, unreadOnly: boolean) {
    return this.prisma.notification.findMany({ where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async unreadCount(user: AuthUser) { return { unread: await this.prisma.notification.count({ where: { userId: user.id, readAt: null } }) }; }
  async markRead(user: AuthUser, ids?: string[]) {
    const r = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  /** Recipients for a rule: managers holding the configured roles whose scope covers the SPG (or all, when no SPG). */
  private async recipients(rule: Rule, spg?: { id: string; userId: string | null; currentAreaId: string; currentSupervisorId: string | null; regionId?: string }) {
    const users = new Set<string>();
    if (rule.roles.includes('SPG') && spg?.userId) users.add(spg.userId);
    for (const role of rule.roles.filter((r) => r !== 'SPG')) {
      const where: Prisma.UserWhereInput = { isActive: true, roles: { some: { role: { code: role } } } };
      if (spg && role === ROLES.SUPERVISOR) where.supervisor = { id: spg.currentSupervisorId ?? '00000000-0000-0000-0000-000000000000' };
      if (spg && role === ROLES.AREA_MANAGER) where.areaId = spg.currentAreaId;
      if (spg && role === ROLES.REGIONAL_MANAGER) where.region = { areas: { some: { id: spg.currentAreaId } } };
      (await this.prisma.user.findMany({ where, select: { id: true } })).forEach((u) => users.add(u.id));
    }
    return [...users];
  }

  async emit(type: string, payload: { title: string; body?: string; link?: string; dedup: string; spgId?: string }) {
    const rules = await this.settings.get<Rules>('notifications.rules');
    const rule = rules[type];
    if (!rule?.enabled) return 0;
    const spg = payload.spgId ? await this.prisma.spg.findUnique({ where: { id: payload.spgId }, select: { id: true, userId: true, currentAreaId: true, currentSupervisorId: true } }) : undefined;
    const to = await this.recipients(rule, spg ?? undefined);
    if (!to.length) return 0;
    const r = await this.prisma.notification.createMany({ skipDuplicates: true, data: to.map((userId) => ({ userId, type, severity: rule.severity, title: payload.title, body: payload.body, link: payload.link, dedupKey: `${type}:${payload.dedup}:${userId}` })) });
    return r.count;
  }

  /** Scheduled scan (worker). Each block is independent so one failure does not stop the others. */
  async scan(today = jakartaDate()) {
    const created: Record<string, number> = {};
    const add = (k: string, n: number) => { created[k] = (created[k] ?? 0) + n; };
    const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
    const safely = async (k: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { this.log.error(`${k}: ${(e as Error).message}`); } };

    await safely('MISSING_CHECKIN', async () => {
      const spgs = await this.prisma.spg.findMany({ where: { status: 'ACTIVE', attendance: { none: { workDate: new Date(`${today}T00:00:00Z`) } } }, select: { id: true, fullName: true } });
      for (const s of spgs) add('MISSING_CHECKIN', await this.emit('MISSING_CHECKIN', { title: `${s.fullName} has not checked in today`, link: `/attendance?date=${today}`, dedup: `${s.id}:${today}`, spgId: s.id }));
    });
    await safely('MISSING_REPORT', async () => {
      const rows = await this.prisma.attendance.findMany({ where: { workDate: new Date(`${yesterday}T00:00:00Z`), spg: { dailyReports: { none: { reportDate: new Date(`${yesterday}T00:00:00Z`), status: { not: 'DRAFT' } } } } }, select: { spgId: true, spg: { select: { fullName: true } } } });
      for (const r of rows) add('MISSING_REPORT', await this.emit('MISSING_REPORT', { title: `${r.spg.fullName} did not submit the report for ${yesterday}`, link: '/attendance', dedup: `${r.spgId}:${yesterday}`, spgId: r.spgId }));
    });
    await safely('OCR_NEEDS_REVIEW', async () => {
      const n = await this.prisma.fileLog.count({ where: { status: 'NEEDS_REVIEW' } });
      if (n) add('OCR_NEEDS_REVIEW', await this.emit('OCR_NEEDS_REVIEW', { title: `${n} paper form(s) waiting for OCR review`, link: '/integrations/ocr', dedup: `${today}:${n}` }));
    });
    await safely('SYNC_FAILED', async () => {
      const n = await this.prisma.fileLog.count({ where: { status: 'SYNC_FAILED' } }) + await this.prisma.syncJob.count({ where: { status: 'FAILED', createdAt: { gt: new Date(Date.now() - 86400000) } } });
      if (n) add('SYNC_FAILED', await this.emit('SYNC_FAILED', { title: `${n} failed synchronisation(s)`, link: '/integrations', dedup: `${today}:${n}` }));
    });
    await safely('DUPLICATE_SUBMISSION', async () => {
      const rows = await this.prisma.retailerTransaction.findMany({ where: { duplicateType: 'EXACT_DUPLICATE', validationStatus: { in: ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'] } }, select: { id: true, transactionNo: true, spgId: true } });
      for (const t of rows) add('DUPLICATE_SUBMISSION', await this.emit('DUPLICATE_SUBMISSION', { title: `Possible duplicate transaction ${t.transactionNo}`, link: `/grosir/transactions/${t.id}`, dedup: t.id, spgId: t.spgId }));
    });
    await safely('APPROVAL_PENDING', async () => {
      const n = await this.prisma.approval.count({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 86400000) } } });
      if (n) add('APPROVAL_PENDING', await this.emit('APPROVAL_PENDING', { title: `${n} approval request(s) pending > 24 h`, link: '/approvals', dedup: `${today}:${n}` }));
    });
    return created;
  }

  /** After KPI recalculation: low achievement and performance drops vs previous month. */
  async performanceAlerts(period: string) {
    const rules = await this.settings.get<Rules>('notifications.rules');
    const threshold = rules.LOW_ACHIEVEMENT?.thresholdPct ?? 70; const drop = rules.PERFORMANCE_DROP?.dropPoints ?? 10;
    const pm = new Date(`${period}-01T00:00:00Z`); const prev = new Date(pm); prev.setUTCMonth(prev.getUTCMonth() - 1);
    const [cur, before] = await Promise.all([
      this.prisma.performanceSnapshot.findMany({ where: { periodMonth: pm, totalScore: { not: null } }, include: { spg: { select: { fullName: true } } } }),
      this.prisma.performanceSnapshot.findMany({ where: { periodMonth: prev, totalScore: { not: null } } }),
    ]);
    const prevMap = new Map(before.map((b) => [b.spgId, Number(b.totalScore)]));
    let n = 0;
    for (const s of cur) {
      const score = Number(s.totalScore);
      if (score < threshold) n += await this.emit('LOW_ACHIEVEMENT', { title: `${s.spg.fullName}: score ${score.toFixed(1)} below ${threshold}`, link: `/performance/${s.spgId}?period=${period}`, dedup: `${s.spgId}:${period}`, spgId: s.spgId });
      const p = prevMap.get(s.spgId);
      if (p != null && p - score >= drop) n += await this.emit('PERFORMANCE_DROP', { title: `${s.spg.fullName}: score fell ${(p - score).toFixed(1)} pts vs last month`, link: `/performance/${s.spgId}?period=${period}`, dedup: `${s.spgId}:${period}`, spgId: s.spgId });
    }
    return n;
  }
}

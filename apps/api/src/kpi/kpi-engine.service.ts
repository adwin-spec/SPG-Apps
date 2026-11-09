import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SpgCategoryCode } from '@tanda/database';
import { jakartaDate, monthRange } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { METRICS, MetricCtx, MetricRow, metricValue } from './metrics';
import { aggregate, band, rank, scoreKpi } from './scoring';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));

export interface RecalcResult { period: string; categories: { category: string; spgs: number; kpis: number; skippedLocked: number; missingFormula: string[] }[]; durationMs: number }

/**
 * KPI engine (brief §I). Configuration (formula version, weight, target) is resolved per period
 * from effective-dated tables, metrics are computed set-based in SQL, scores are deterministic,
 * and every result carries a trace (numerator/denominator, statuses, formula & target source).
 */
@Injectable()
export class KpiEngineService {
  private readonly log = new Logger(KpiEngineService.name);
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  /** Effective formula & weight for a KPI at the period start. */
  async config(categoryId: string, periodStart: Date) {
    const defs = await this.prisma.kpiDefinition.findMany({
      where: { categoryId, isActive: true }, orderBy: { displayOrder: 'asc' },
      include: {
        formulas: { where: { effectiveFrom: { lte: periodStart }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }] }, orderBy: { version: 'desc' }, take: 1 },
        weights: { where: { effectiveFrom: { lte: periodStart }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }] }, orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
    });
    return defs.map((k) => ({ def: k, formula: k.formulas[0] ?? null, weightPct: k.weights[0] ? Number(k.weights[0].weightPct) : 0 }));
  }

  async recalculate(period: string, opts: { category?: SpgCategoryCode; spgId?: string } = {}): Promise<RecalcResult> {
    const t0 = Date.now();
    const { start, endExclusive } = monthRange(period);
    const today = jakartaDate();
    const asOf = today < endExclusive ? today : endExclusive;
    const [final, finalVisit, minEffectiveMin, activeWindowDays, policy, bands] = await Promise.all([
      this.settings.get<string[]>('kpi.finalStatuses'), this.settings.get<string[]>('kpi.finalVisitStatuses'),
      this.settings.get<number>('visits.minEffectiveDurationMin'), this.settings.get<number>('wholesale.activeRetailerWindowDays'),
      this.settings.get<'EXCLUDE_AND_RENORMALIZE' | 'EXCLUDE_NO_RENORMALIZE'>('kpi.missingDataPolicy'),
      this.settings.get<{ status: string; min: number }[]>('kpi.performanceBands'),
    ]);
    const categories = await this.prisma.spgCategory.findMany({ where: opts.category ? { code: opts.category } : {} });
    const out: RecalcResult['categories'] = [];

    for (const cat of categories) {
      // SPGs employed during the period
      const spgs = await this.prisma.spg.findMany({
        where: { categoryId: cat.id, joinDate: { lt: d(endExclusive) }, OR: [{ endDate: null }, { endDate: { gte: d(start) } }], ...(opts.spgId ? { id: opts.spgId } : {}) },
        select: { id: true },
      });
      const locked = new Set((await this.prisma.performanceSnapshot.findMany({ where: { periodMonth: d(start), isLocked: true, spgId: { in: spgs.map((s) => s.id) } }, select: { spgId: true } })).map((s) => s.spgId));
      const spgIds = spgs.map((s) => s.id).filter((id) => !locked.has(id));
      const cfg = await this.config(cat.id, d(start));
      const missingFormula = cfg.filter((c) => !c.formula || !METRICS[c.formula.metricKey]).map((c) => c.def.code);
      const scorable = cfg.filter((c) => c.formula && METRICS[c.formula.metricKey]);
      out.push({ category: cat.code, spgs: spgIds.length, kpis: scorable.length, skippedLocked: locked.size, missingFormula });
      if (!spgIds.length || !scorable.length) continue;

      const active = new Set((await this.prisma.attendance.findMany({ where: { spgId: { in: spgIds }, workDate: { gte: d(start), lt: d(endExclusive) }, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } }, distinct: ['spgId'], select: { spgId: true } })).map((a) => a.spgId));
      const kpiIds = scorable.map((c) => c.def.id);
      const [catTargets, overrides] = await Promise.all([
        this.prisma.target.findMany({ where: { kpiDefinitionId: { in: kpiIds }, periodMonth: d(start), isCurrent: true } }),
        this.prisma.targetAssignment.findMany({ where: { kpiDefinitionId: { in: kpiIds }, periodMonth: d(start), isCurrent: true, spgId: { in: spgIds } } }),
      ]);
      const catTarget = new Map(catTargets.map((t) => [t.kpiDefinitionId, Number(t.value)]));
      const ovTarget = new Map(overrides.map((t) => [`${t.kpiDefinitionId}:${t.spgId}`, Number(t.value)]));

      const results: Prisma.PerformanceResultCreateManyInput[] = [];
      for (const c of scorable) {
        const metric = METRICS[c.formula!.metricKey];
        const ctx: MetricCtx = { spgIds, start, endExclusive, asOf, final, finalVisit, minEffectiveMin, activeWindowDays, params: (c.formula!.params as Record<string, unknown>) ?? {} };
        const rows = await this.prisma.$queryRaw<MetricRow[]>(metric.sql(ctx));
        const bySpg = new Map(rows.map((r) => [r.spg_id, r]));
        const cap = num(c.formula!.achievementCapPct);
        for (const spgId of spgIds) {
          const row = bySpg.get(spgId);
          const actual = metricValue(metric.kind, row, active.has(spgId));
          const ov = ovTarget.get(`${c.def.id}:${spgId}`);
          const target = ov ?? catTarget.get(c.def.id) ?? null;
          const s = scoreKpi({ actual, target, direction: c.def.direction, capPct: cap, weightPct: c.weightPct });
          results.push({
            spgId, kpiDefinitionId: c.def.id, periodMonth: d(start), formulaVersion: c.formula!.version,
            actualValue: actual, targetValue: target, targetSource: ov != null ? 'SPG_OVERRIDE' : target != null ? 'CATEGORY' : null,
            achievementPct: s.achievementPct, scoredPct: s.scoredPct, weightPct: c.weightPct, weightedScore: s.weightedScore, dataStatus: s.dataStatus,
            sourceCount: row?.den != null ? Number(row.den) : row?.num != null ? 1 : 0,
            trace: { metricKey: c.formula!.metricKey, kind: metric.kind, source: metric.source, numerator: row?.num != null ? Number(row.num) : null, denominator: row?.den != null ? Number(row.den) : null,
              spgActiveInPeriod: active.has(spgId), finalStatuses: final, finalVisitStatuses: finalVisit, period: { start, endExclusive, asOf }, capPct: cap },
          });
        }
      }

      // Aggregate per SPG: total, activity and business-outcome scores are kept separate.
      const isActivity = new Map(scorable.map((c) => [c.def.id, c.def.isActivity]));
      const perSpg = spgIds.map((spgId) => {
        const rs = results.filter((r) => r.spgId === spgId).map((r) => ({ weightPct: Number(r.weightPct), scoredPct: r.scoredPct == null ? null : Number(r.scoredPct), activity: isActivity.get(r.kpiDefinitionId)! }));
        const total = aggregate(rs, policy);
        return { spgId, score: total.score, coverage: total.coveragePct,
          activity: aggregate(rs.filter((r) => r.activity), 'EXCLUDE_AND_RENORMALIZE').score, outcome: aggregate(rs.filter((r) => !r.activity), 'EXCLUDE_AND_RENORMALIZE').score };
      });
      // Rank across the whole category (not only the recalculated subset) for consistency.
      const others = await this.prisma.performanceSnapshot.findMany({ where: { periodMonth: d(start), spg: { categoryId: cat.id }, spgId: { notIn: spgIds } }, select: { spgId: true, totalScore: true } });
      const ranked = rank([...perSpg.map((p) => ({ id: p.spgId, score: p.score })), ...others.map((o) => ({ id: o.spgId, score: num(o.totalScore) }))]);
      const rankOf = new Map(ranked.map((r) => [r.id, r.rank]));
      const configSnapshot = { policy, finalStatuses: final, finalVisitStatuses: finalVisit, kpis: scorable.map((c) => ({ code: c.def.code, metricKey: c.formula!.metricKey, formulaVersion: c.formula!.version, weightPct: c.weightPct, capPct: num(c.formula!.achievementCapPct), isActivity: c.def.isActivity })) };

      await this.prisma.$transaction(async (tx) => {
        // Results are derived data: replaced atomically for non-locked SPGs (locked snapshots are immutable).
        await tx.performanceResult.deleteMany({ where: { periodMonth: d(start), spgId: { in: spgIds } } });
        await tx.performanceResult.createMany({ data: results });
        for (const p of perSpg) {
          const data = { totalScore: p.score, activityScore: p.activity, outcomeScore: p.outcome, weightCoverage: p.coverage, rankInCategory: rankOf.get(p.spgId) ?? null,
            performanceStatus: band(p.score, bands), configSnapshot, computedAt: new Date() };
          await tx.performanceSnapshot.upsert({ where: { spgId_periodMonth: { spgId: p.spgId, periodMonth: d(start) } }, create: { spgId: p.spgId, periodMonth: d(start), ...data }, update: data });
        }
        for (const o of others) await tx.performanceSnapshot.updateMany({ where: { spgId: o.spgId, periodMonth: d(start), isLocked: false }, data: { rankInCategory: rankOf.get(o.spgId) ?? null } });
      }, { timeout: 60_000 });
    }
    const res = { period, categories: out, durationMs: Date.now() - t0 };
    this.log.log(`KPI recalculated ${period}: ${JSON.stringify(out)} in ${res.durationMs} ms`);
    return res;
  }
}

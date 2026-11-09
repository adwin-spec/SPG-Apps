import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { kpiDefinitionCreateSchema, kpiDefinitionUpdateSchema, kpiFormulaVersionSchema, kpiWeightChangeSchema, periodMonth, targetUpsertSchema, METRIC_CATALOG, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { toDate } from '../common/http/paginated';

/** KPI configuration without code changes: every change is versioned & effective-dated (history kept). */
@Injectable()
export class KpiConfigService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: ScopeService) {}

  async list(category?: 'GROSIR' | 'HORECA' | 'REGULER') {
    const defs = await this.prisma.kpiDefinition.findMany({
      where: category ? { category: { code: category } } : {},
      include: { category: { select: { code: true } }, formulas: { where: { effectiveTo: null } }, weights: { where: { effectiveTo: null } } },
      orderBy: [{ category: { code: 'asc' } }, { displayOrder: 'asc' }],
    });
    const rows = defs.map((k) => ({ id: k.id, code: k.code, name: k.name, description: k.description, category: k.category.code, dimension: k.dimension, unit: k.unit,
      direction: k.direction, isActivity: k.isActivity, isActive: k.isActive, displayOrder: k.displayOrder, dataSource: k.dataSource,
      formula: k.formulas[0] ?? null, weightPct: k.weights[0] ? Number(k.weights[0].weightPct) : null, metric: METRIC_CATALOG.find((m) => m.key === k.formulas[0]?.metricKey) ?? null }));
    const weightTotals = rows.filter((r) => r.isActive).reduce<Record<string, number>>((a, r) => ({ ...a, [r.category]: (a[r.category] ?? 0) + (r.weightPct ?? 0) }), {});
    const warnings = Object.entries(weightTotals).filter(([, w]) => Math.abs(w - 100) > 0.001).map(([c, w]) => `Active KPI weights for ${c} sum to ${w}% (expected 100%). Scores are renormalised but weights should be reviewed.`);
    return { definitions: rows, weightTotals, warnings };
  }

  async create(user: AuthUser, input: z.infer<typeof kpiDefinitionCreateSchema>) {
    const meta = METRIC_CATALOG.find((m) => m.key === input.metricKey)!;
    if (meta.channel !== 'ALL' && meta.channel !== input.category) throw new BadRequestException({ code: 'METRIC_CATEGORY_MISMATCH', message: `Metric ${input.metricKey} belongs to ${meta.channel}` });
    const category = await this.prisma.spgCategory.findUniqueOrThrow({ where: { code: input.category } });
    return this.prisma.$transaction(async (tx) => {
      const def = await tx.kpiDefinition.create({ data: { code: input.code, name: input.name, description: input.description, categoryId: category.id, dimension: input.dimension, unit: input.unit,
        direction: input.direction, isActivity: input.isActivity, dataSource: input.dataSource ?? meta.description, displayOrder: input.displayOrder } });
      await tx.kpiFormula.create({ data: { kpiDefinitionId: def.id, version: 1, metricKey: input.metricKey, params: input.params as Prisma.InputJsonValue, achievementCapPct: input.achievementCapPct,
        thresholds: input.thresholds ?? undefined, effectiveFrom: toDate(input.effectiveFrom), createdById: user.id } });
      await tx.kpiWeight.create({ data: { kpiDefinitionId: def.id, weightPct: input.weightPct, effectiveFrom: toDate(input.effectiveFrom), reason: 'Initial weight', createdById: user.id } });
      await this.audit.log({ actorId: user.id, action: 'CREATE', entityType: 'KpiDefinition', entityId: def.id, after: input }, tx);
      return def;
    });
  }

  async update(user: AuthUser, id: string, input: z.infer<typeof kpiDefinitionUpdateSchema>) {
    const before = await this.prisma.kpiDefinition.findUniqueOrThrow({ where: { id } });
    const after = await this.prisma.kpiDefinition.update({ where: { id }, data: input });
    await this.audit.log({ actorId: user.id, action: 'UPDATE', entityType: 'KpiDefinition', entityId: id, before, after });
    return after;
  }

  async newFormulaVersion(user: AuthUser, id: string, input: z.infer<typeof kpiFormulaVersionSchema>) {
    const def = await this.prisma.kpiDefinition.findUniqueOrThrow({ where: { id }, include: { category: true, formulas: { orderBy: { version: 'desc' } } } });
    const meta = METRIC_CATALOG.find((m) => m.key === input.metricKey)!;
    if (meta.channel !== 'ALL' && meta.channel !== def.category.code) throw new BadRequestException({ code: 'METRIC_CATEGORY_MISMATCH', message: `Metric ${input.metricKey} belongs to ${meta.channel}` });
    const current = def.formulas.find((f) => f.effectiveTo == null);
    const from = toDate(input.effectiveFrom);
    if (current && current.effectiveFrom >= from) throw new BadRequestException({ code: 'INVALID_EFFECTIVE_DATE', message: 'New version must start after the current version' });
    return this.prisma.$transaction(async (tx) => {
      if (current) await tx.kpiFormula.update({ where: { id: current.id }, data: { effectiveTo: from } });
      const f = await tx.kpiFormula.create({ data: { kpiDefinitionId: id, version: (def.formulas[0]?.version ?? 0) + 1, metricKey: input.metricKey, params: input.params as Prisma.InputJsonValue,
        achievementCapPct: input.achievementCapPct, thresholds: input.thresholds ?? undefined, effectiveFrom: from, createdById: user.id } });
      await this.audit.log({ actorId: user.id, action: 'NEW_FORMULA_VERSION', entityType: 'KpiDefinition', entityId: id, before: current, after: f }, tx);
      return f;
    });
  }

  async changeWeight(user: AuthUser, id: string, input: z.infer<typeof kpiWeightChangeSchema>) {
    const current = await this.prisma.kpiWeight.findFirst({ where: { kpiDefinitionId: id, effectiveTo: null } });
    const from = toDate(input.effectiveFrom);
    if (current && current.effectiveFrom >= from) throw new BadRequestException({ code: 'INVALID_EFFECTIVE_DATE', message: 'New weight must start after the current weight' });
    return this.prisma.$transaction(async (tx) => {
      if (current) await tx.kpiWeight.update({ where: { id: current.id }, data: { effectiveTo: from } });
      const w = await tx.kpiWeight.create({ data: { kpiDefinitionId: id, weightPct: input.weightPct, effectiveFrom: from, reason: input.reason, createdById: user.id } });
      await this.audit.log({ actorId: user.id, action: 'CHANGE_WEIGHT', entityType: 'KpiDefinition', entityId: id, before: current ? { weightPct: Number(current.weightPct) } : null, after: { weightPct: input.weightPct, effectiveFrom: input.effectiveFrom }, reason: input.reason }, tx);
      return w;
    });
  }

  async history(id: string) {
    const def = await this.prisma.kpiDefinition.findUnique({ where: { id }, include: { formulas: { orderBy: { version: 'desc' } }, weights: { orderBy: { effectiveFrom: 'desc' } },
      targets: { orderBy: [{ periodMonth: 'desc' }, { createdAt: 'desc' }], take: 100 } } });
    if (!def) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    return def;
  }

  /** Target matrix for a period: category default + per-SPG overrides. Missing = UNDEFINED (not zero). */
  async targets(period: string, category?: 'GROSIR' | 'HORECA' | 'REGULER') {
    const pm = toDate(periodMonth(period));
    const defs = await this.prisma.kpiDefinition.findMany({ where: { isActive: true, ...(category ? { category: { code: category } } : {}) }, include: { category: { select: { code: true } } }, orderBy: [{ category: { code: 'asc' } }, { displayOrder: 'asc' }] });
    const [targets, overrides] = await Promise.all([
      this.prisma.target.findMany({ where: { periodMonth: pm, isCurrent: true, kpiDefinitionId: { in: defs.map((x) => x.id) } } }),
      this.prisma.targetAssignment.findMany({ where: { periodMonth: pm, isCurrent: true, kpiDefinitionId: { in: defs.map((x) => x.id) } }, include: { spg: { select: { fullName: true, employeeCode: true } } } }),
    ]);
    return defs.map((k) => {
      const t = targets.find((x) => x.kpiDefinitionId === k.id);
      return { kpiDefinitionId: k.id, code: k.code, name: k.name, unit: k.unit, category: k.category.code,
        target: t ? Number(t.value) : null, targetStatus: t ? (Number(t.value) === 0 ? 'ZERO' : 'DEFINED') : 'UNDEFINED', setAt: t?.createdAt ?? null, reason: t?.reason ?? null,
        overrides: overrides.filter((o) => o.kpiDefinitionId === k.id).map((o) => ({ spgId: o.spgId, spg: o.spg.fullName, employeeCode: o.spg.employeeCode, value: Number(o.value), reason: o.reason })) };
    });
  }

  async upsertTargets(user: AuthUser, items: z.infer<typeof targetUpsertSchema>[]) {
    let changed = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        const pm = toDate(periodMonth(it.period));
        if (it.spgId) {
          if (!(await this.scope.canAccessSpg(user, it.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG outside your scope' });
          const def = await tx.kpiDefinition.findUniqueOrThrow({ where: { id: it.kpiDefinitionId } });
          const spg = await tx.spg.findUniqueOrThrow({ where: { id: it.spgId } });
          if (spg.categoryId !== def.categoryId) throw new BadRequestException({ code: 'CATEGORY_MISMATCH', message: 'KPI belongs to another SPG category' });
          const prev = await tx.targetAssignment.findFirst({ where: { kpiDefinitionId: it.kpiDefinitionId, spgId: it.spgId, periodMonth: pm, isCurrent: true } });
          if (prev && it.value != null && Number(prev.value) === it.value) continue;
          if (prev) await tx.targetAssignment.update({ where: { id: prev.id }, data: { isCurrent: false } });
          if (it.value != null) await tx.targetAssignment.create({ data: { kpiDefinitionId: it.kpiDefinitionId, spgId: it.spgId, periodMonth: pm, value: it.value, reason: it.reason, createdById: user.id } });
          await this.audit.log({ actorId: user.id, action: it.value == null ? 'REMOVE_TARGET_OVERRIDE' : 'SET_TARGET_OVERRIDE', entityType: 'TargetAssignment', entityId: it.kpiDefinitionId,
            before: prev ? { value: Number(prev.value) } : null, after: { spgId: it.spgId, period: it.period, value: it.value }, reason: it.reason }, tx);
        } else {
          const prev = await tx.target.findFirst({ where: { kpiDefinitionId: it.kpiDefinitionId, periodMonth: pm, isCurrent: true } });
          if (prev && it.value != null && Number(prev.value) === it.value) continue;
          if (prev) await tx.target.update({ where: { id: prev.id }, data: { isCurrent: false } });
          if (it.value != null) await tx.target.create({ data: { kpiDefinitionId: it.kpiDefinitionId, periodMonth: pm, value: it.value, reason: it.reason, createdById: user.id } });
          await this.audit.log({ actorId: user.id, action: it.value == null ? 'REMOVE_TARGET' : 'SET_TARGET', entityType: 'Target', entityId: it.kpiDefinitionId,
            before: prev ? { value: Number(prev.value) } : null, after: { period: it.period, value: it.value }, reason: it.reason }, tx);
        }
        changed++;
      }
    });
    if (!changed) throw new ConflictException({ code: 'NO_CHANGES', message: 'All targets already have these values' });
    return { changed };
  }
}

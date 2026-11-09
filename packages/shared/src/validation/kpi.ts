import { z } from 'zod';
import { uuid, isoDate, isoMonth, optText } from './common';
import { METRIC_KEYS } from '../config/kpi-catalog';

export const kpiDimension = z.enum(['PRODUCTIVITY', 'COVERAGE', 'COMMERCIAL', 'EXECUTION', 'INTELLIGENCE', 'DATA_QUALITY', 'REPORTING_COMPLIANCE']);
const thresholds = z.object({ good: z.number().min(0).max(1000), watch: z.number().min(0).max(1000) }).refine((t) => t.good >= t.watch, 'good must be ≥ watch');

export const kpiDefinitionCreateSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/, 'UPPER_SNAKE_CASE'),
  name: z.string().trim().min(2).max(160),
  description: optText(1000),
  category: z.enum(['GROSIR', 'HORECA', 'REGULER']),
  dimension: kpiDimension,
  unit: z.string().trim().min(1).max(20),
  direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER']).default('HIGHER_IS_BETTER'),
  isActivity: z.boolean(),
  dataSource: optText(500),
  displayOrder: z.number().int().min(0).max(999).default(0),
  metricKey: z.string().refine((k) => METRIC_KEYS.includes(k), 'Unknown metric key'),
  params: z.record(z.string(), z.unknown()).default({}),
  achievementCapPct: z.number().min(0).max(1000).nullable().default(null),
  thresholds: thresholds.optional().nullable(),
  weightPct: z.number().min(0).max(100),
  effectiveFrom: isoDate,
});
export const kpiDefinitionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: optText(1000),
  dimension: kpiDimension.optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  dataSource: optText(500),
});
export const kpiFormulaVersionSchema = z.object({
  metricKey: z.string().refine((k) => METRIC_KEYS.includes(k), 'Unknown metric key'),
  params: z.record(z.string(), z.unknown()).default({}),
  achievementCapPct: z.number().min(0).max(1000).nullable(),
  thresholds: thresholds.optional().nullable(),
  effectiveFrom: isoDate,
});
export const kpiWeightChangeSchema = z.object({
  weightPct: z.number().min(0).max(100),
  effectiveFrom: isoDate,
  reason: z.string().trim().min(3).max(500),
});
export const targetUpsertSchema = z.object({
  kpiDefinitionId: uuid,
  period: isoMonth,
  /** null = remove target (becomes UNDEFINED, never 0). */
  value: z.number().min(0).max(1e15).nullable(),
  spgId: uuid.optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});
export const targetBulkSchema = z.object({ items: z.array(targetUpsertSchema).min(1).max(2000) });
export const recalcSchema = z.object({ period: isoMonth, category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional(), spgId: uuid.optional() });

/**
 * Pure KPI scoring rules (brief §I). No I/O – fully unit-tested.
 *  - target undefined ⇒ NO_TARGET (not scored)          - target 0 ⇒ ZERO_TARGET (not scored, flagged)
 *  - actual missing  ⇒ NO_DATA (not scored, never 0)     - division by zero never produces Infinity/NaN
 */
export type DataStatus = 'OK' | 'NO_DATA' | 'NO_TARGET' | 'ZERO_TARGET';
export type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';

export interface KpiInput { actual: number | null; target: number | null; direction: Direction; capPct: number | null; weightPct: number }
export interface KpiScore { dataStatus: DataStatus; achievementPct: number | null; scoredPct: number | null; weightedScore: number | null }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function scoreKpi(i: KpiInput): KpiScore {
  if (i.target == null) return { dataStatus: 'NO_TARGET', achievementPct: null, scoredPct: null, weightedScore: null };
  if (i.actual == null) return { dataStatus: 'NO_DATA', achievementPct: null, scoredPct: null, weightedScore: null };
  if (i.target === 0) return { dataStatus: 'ZERO_TARGET', achievementPct: null, scoredPct: null, weightedScore: null };
  let achievement: number;
  if (i.direction === 'HIGHER_IS_BETTER') achievement = (i.actual / i.target) * 100;
  else achievement = i.actual === 0 ? (i.capPct ?? 100) : (i.target / i.actual) * 100;
  achievement = Math.max(0, achievement);
  const scored = i.capPct != null ? Math.min(achievement, i.capPct) : achievement;
  return { dataStatus: 'OK', achievementPct: r2(achievement), scoredPct: r2(scored), weightedScore: Math.round(scored * i.weightPct) / 100 };
}

export interface Aggregate { score: number | null; coveragePct: number | null }

/**
 * Performance Score = Σ(scored% × weight) / Σ(weights of scored KPIs) when RENORMALIZE (default),
 * or Σ(scored% × weight)/100 when NO_RENORMALIZE. Coverage = scored weight / total weight.
 */
export function aggregate(rows: { weightPct: number; scoredPct: number | null }[], policy: 'EXCLUDE_AND_RENORMALIZE' | 'EXCLUDE_NO_RENORMALIZE'): Aggregate {
  const totalW = rows.reduce((a, r) => a + r.weightPct, 0);
  const scored = rows.filter((r) => r.scoredPct != null);
  const scoredW = scored.reduce((a, r) => a + r.weightPct, 0);
  if (totalW === 0) return { score: null, coveragePct: null };
  const coveragePct = r2((scoredW / totalW) * 100);
  if (scoredW === 0) return { score: null, coveragePct };
  const sum = scored.reduce((a, r) => a + (r.scoredPct as number) * r.weightPct, 0);
  return { score: r2(policy === 'EXCLUDE_AND_RENORMALIZE' ? sum / scoredW : sum / 100), coveragePct };
}

export function band(score: number | null, bands: { status: string; min: number }[]): string | null {
  if (score == null) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((b) => score >= b.min)?.status ?? null;
}

/** Dense ranking, highest score first; null scores are unranked. */
export function rank<T extends { score: number | null }>(rows: T[]): (T & { rank: number | null })[] {
  const sorted = [...rows].filter((r) => r.score != null).sort((a, b) => (b.score as number) - (a.score as number));
  const ranks = new Map<T, number>();
  let prev: number | null = null; let pos = 0;
  sorted.forEach((r, i) => { if (r.score !== prev) { pos = i + 1; prev = r.score; } ranks.set(r, pos); });
  return rows.map((r) => ({ ...r, rank: ranks.get(r) ?? null }));
}

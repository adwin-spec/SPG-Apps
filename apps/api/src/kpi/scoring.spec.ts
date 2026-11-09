import { aggregate, band, rank, scoreKpi } from './scoring';

describe('KPI scoring', () => {
  const base = { direction: 'HIGHER_IS_BETTER' as const, capPct: 100, weightPct: 20 };
  it('scores achievement and weighted score', () => {
    expect(scoreKpi({ ...base, actual: 45, target: 50 })).toEqual({ dataStatus: 'OK', achievementPct: 90, scoredPct: 90, weightedScore: 18 });
  });
  it('caps achievement but keeps the raw value', () => {
    const s = scoreKpi({ ...base, actual: 150, target: 100 });
    expect(s.achievementPct).toBe(150); expect(s.scoredPct).toBe(100);
  });
  it('distinguishes undefined target, zero target and missing data – never scores them as 0', () => {
    expect(scoreKpi({ ...base, actual: 10, target: null }).dataStatus).toBe('NO_TARGET');
    expect(scoreKpi({ ...base, actual: 10, target: 0 }).dataStatus).toBe('ZERO_TARGET');
    expect(scoreKpi({ ...base, actual: null, target: 10 })).toEqual({ dataStatus: 'NO_DATA', achievementPct: null, scoredPct: null, weightedScore: null });
  });
  it('handles lower-is-better including actual = 0 without division by zero', () => {
    expect(scoreKpi({ ...base, direction: 'LOWER_IS_BETTER', actual: 5, target: 4 }).achievementPct).toBe(80);
    expect(scoreKpi({ ...base, direction: 'LOWER_IS_BETTER', actual: 0, target: 4 }).scoredPct).toBe(100);
  });
  it('aggregates with renormalisation and reports weight coverage', () => {
    const rows = [{ weightPct: 50, scoredPct: 80 }, { weightPct: 30, scoredPct: 100 }, { weightPct: 20, scoredPct: null }];
    expect(aggregate(rows, 'EXCLUDE_AND_RENORMALIZE')).toEqual({ score: 87.5, coveragePct: 80 });
    expect(aggregate(rows, 'EXCLUDE_NO_RENORMALIZE')).toEqual({ score: 70, coveragePct: 80 });
    expect(aggregate([{ weightPct: 10, scoredPct: null }], 'EXCLUDE_AND_RENORMALIZE')).toEqual({ score: null, coveragePct: 0 });
  });
  it('bands and ranks scores (ties share a rank, nulls unranked)', () => {
    const bands = [{ status: 'GOOD', min: 90 }, { status: 'WATCH', min: 70 }, { status: 'CRITICAL', min: 0 }];
    expect(band(91, bands)).toBe('GOOD'); expect(band(70, bands)).toBe('WATCH'); expect(band(null, bands)).toBeNull();
    expect(rank([{ id: 'a', score: 80 }, { id: 'b', score: 95 }, { id: 'c', score: 80 }, { id: 'd', score: null }]).map((r) => r.rank)).toEqual([2, 1, 2, null]);
  });
});

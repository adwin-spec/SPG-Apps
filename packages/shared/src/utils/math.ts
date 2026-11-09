/** Returns null instead of Infinity/NaN when the denominator is 0, null or undefined (risk R3). */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function pct(numerator: number | null | undefined, denominator: number | null | undefined, digits = 2): number | null {
  const r = safeDivide(numerator, denominator);
  return r == null ? null : round(r * 100, digits);
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Share of Shelf = company facing / total category facing × 100. NULL when total = 0. */
export function shareOfShelf(companyFacing: number, totalCategoryFacing: number): number | null {
  if (companyFacing < 0 || totalCategoryFacing < 0) throw new Error('Facing cannot be negative');
  if (companyFacing > totalCategoryFacing) throw new Error('Company facing cannot exceed total category facing');
  return pct(companyFacing, totalCategoryFacing);
}

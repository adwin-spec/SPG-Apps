import type { DuplicateType, ValidationStatus } from '@tanda/database';

export interface ValidationIssue { rule: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; line?: number }
export interface ValidationOutcome { status: ValidationStatus; issues: ValidationIssue[] }

/** WARNING/CRITICAL ⇒ NEEDS_REVIEW; INFO only ⇒ VALIDATED. Never auto-APPROVED (human layer). */
export function outcome(issues: ValidationIssue[]): ValidationOutcome {
  return { status: issues.some((i) => i.severity !== 'INFO') ? 'NEEDS_REVIEW' : 'VALIDATED', issues };
}

/** Order-independent signature of transaction lines for exact-duplicate detection. */
export function lineSignature(items: { productVariantId?: string | null; competitorProductId?: string | null; brandText?: string | null; skuText?: string | null; quantity: number | string; unitPrice?: number | string | null }[]) {
  return items
    .map((i) => [i.productVariantId ?? '', i.competitorProductId ?? '', (i.brandText ?? '').toLowerCase().trim(), (i.skuText ?? '').toLowerCase().trim(), Number(i.quantity), i.unitPrice == null ? '' : Number(i.unitPrice)].join('|'))
    .sort()
    .join('#');
}

/**
 * Duplicate classification (brief §K): EXACT = same retailer/date/SPG and identical lines;
 * POTENTIAL = same retailer/date and same total value but different lines. Duplicates are flagged, never deleted.
 */
export function classifyDuplicate(candidate: { signature: string; totalValue: number },
  existing: { id: string; signature: string; totalValue: number; sameSpg: boolean }[]): { type: DuplicateType; ofId: string | null } {
  const exact = existing.find((e) => e.sameSpg && e.signature === candidate.signature);
  if (exact) return { type: 'EXACT_DUPLICATE', ofId: exact.id };
  const potential = existing.find((e) => Math.abs(e.totalValue - candidate.totalValue) < 0.005 || e.signature === candidate.signature);
  if (potential) return { type: 'POTENTIAL_DUPLICATE', ofId: potential.id };
  return { type: 'NONE', ofId: null };
}

import { z } from 'zod';
import { uuid, isoDate, optText } from './common';

export const approvalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optText(1000),
});
export const settingUpdateSchema = z.object({
  value: z.unknown(),
  confirmProductionValue: z.boolean().default(false),
});
export const ocrIngestMetaSchema = z.object({
  formId: z.string().trim().max(60).optional().nullable(),
  spgId: uuid.optional().nullable(),
  wholesalerOutletId: uuid.optional().nullable(),
  reportDate: isoDate.optional().nullable(),
  correctionOfFileLogId: uuid.optional().nullable(),
});
export const ocrReviewSchema = z.object({
  /** Reviewer's final, corrected payload (becomes the transaction on approval). */
  final: z.object({
    retailerOutletId: uuid,
    wholesalerOutletId: uuid.optional().nullable(),
    spgId: uuid,
    transactionDate: isoDate,
    items: z.array(z.object({
      productOwner: z.enum(['COMPANY', 'COMPETITOR']),
      productVariantId: uuid.optional().nullable(),
      competitorProductId: uuid.optional().nullable(),
      brandText: z.string().max(120).optional().nullable(),
      skuText: z.string().max(120).optional().nullable(),
      quantity: z.number().positive(),
      unit: z.string().min(1).max(20),
      unitPrice: z.number().nonnegative().optional().nullable(),
    })).min(1),
  }),
  corrections: z.array(z.object({
    path: z.string().max(120),
    originalValue: z.unknown(),
    correctedValue: z.unknown(),
    reason: z.string().max(300).optional(),
  })).default([]),
});
export const ocrDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optText(1000),
});
export const dqIssueUpdateSchema = z.object({ status: z.enum(['RESOLVED', 'IGNORED', 'OPEN']), note: optText(500) });

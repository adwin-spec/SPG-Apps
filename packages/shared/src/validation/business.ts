import { z } from 'zod';
import { uuid, isoDate, money, quantity, optText, offlineMeta } from './common';

const stockAvailability = z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN']);
const dataNature = z.enum(['ACTUAL', 'ESTIMATE', 'OBSERVATION']);

// ── SPG Grosir ─────────────────────────────────────────────
export const transactionItemSchema = z.object({
  productOwner: z.enum(['COMPANY', 'COMPETITOR']),
  productVariantId: uuid.optional().nullable(),
  competitorProductId: uuid.optional().nullable(),
  brandText: z.string().trim().max(120).optional().nullable(),
  skuText: z.string().trim().max(120).optional().nullable(),
  productText: z.string().trim().max(200).optional().nullable(),
  quantity,
  unit: z.string().trim().min(1).max(20),
  unitPrice: money.optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.productOwner === 'COMPANY' && !v.productVariantId) ctx.addIssue({ code: 'custom', message: 'Company line requires a product SKU', path: ['productVariantId'] });
  if (v.productOwner === 'COMPANY' && v.competitorProductId) ctx.addIssue({ code: 'custom', message: 'Company line cannot reference a competitor product', path: ['competitorProductId'] });
  if (v.productOwner === 'COMPETITOR' && v.productVariantId) ctx.addIssue({ code: 'custom', message: 'Competitor line cannot reference a company SKU', path: ['productVariantId'] });
  if (v.productOwner === 'COMPETITOR' && !v.competitorProductId && !v.brandText) ctx.addIssue({ code: 'custom', message: 'Competitor line needs a competitor product or brand text', path: ['brandText'] });
});
export const retailerTransactionSchema = z.object({
  ...offlineMeta,
  retailerOutletId: uuid,
  wholesalerOutletId: uuid.optional().nullable(),
  visitId: uuid.optional().nullable(),
  transactionDate: isoDate,
  dataNature: dataNature.default('ACTUAL'),
  evidenceFileId: uuid.optional().nullable(),
  notes: optText(1000),
  items: z.array(transactionItemSchema).min(1).max(100),
});
export type RetailerTransactionInput = z.infer<typeof retailerTransactionSchema>;

export const transactionCorrectionSchema = z.object({
  clientId: uuid,
  reason: z.string().trim().min(5).max(500),
  transactionDate: isoDate.optional(),
  wholesalerOutletId: uuid.optional().nullable(),
  dataNature: dataNature.optional(),
  items: z.array(transactionItemSchema).min(1).max(100),
});
export const transactionDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optText(500),
});
export const reversalSchema = z.object({ reason: z.string().trim().min(5).max(500) });

export const competitorObservationSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  wholesalerOutletId: uuid.optional().nullable(),
  visitId: uuid.optional().nullable(),
  brandId: uuid.optional().nullable(),
  competitorProductId: uuid.optional().nullable(),
  brandText: z.string().trim().max(120).optional().nullable(),
  skuText: z.string().trim().max(120).optional().nullable(),
  variant: z.string().trim().max(80).optional().nullable(),
  observationDate: isoDate,
  quantityPurchased: z.number().nonnegative().optional().nullable(),
  purchasePrice: money.optional().nullable(),
  sellingPrice: money.optional().nullable(),
  stockAvailability: stockAvailability.default('UNKNOWN'),
  purchaseFrequency: z.string().trim().max(40).optional().nullable(),
  facing: z.number().int().nonnegative().optional().nullable(),
  hasPosm: z.boolean().optional().nullable(),
  hasPromotion: z.boolean().optional().nullable(),
  promotionDetail: optText(1000),
  activityDetail: optText(1000),
  visibilityNote: optText(1000),
  photoFileId: uuid.optional().nullable(),
  dataNature: dataNature.default('OBSERVATION'),
}).refine((v) => v.brandId || v.competitorProductId || v.brandText, { message: 'Brand is required', path: ['brandText'] });

export const wholesaleObservationSchema = z.object({
  ...offlineMeta,
  wholesalerOutletId: uuid,
  visitId: uuid.optional().nullable(),
  productVariantId: uuid,
  observationDate: isoDate,
  stockQuantity: z.number().nonnegative().optional().nullable(),
  stockAvailability: stockAvailability.default('UNKNOWN'),
  buyPrice: money.optional().nullable(),
  sellPrice: money.optional().nullable(),
  restockFrequency: z.string().trim().max(40).optional().nullable(),
  lastRestockDate: isoDate.optional().nullable(),
  notes: optText(1000),
});
export const wholesaleReportSchema = z.object({
  visitId: uuid,
  reportedRetailerCount: z.number().int().nonnegative().optional().nullable(),
  stockNotes: optText(2000),
  marketNotes: optText(2000),
});

// ── SPG HORECA ─────────────────────────────────────────────
export const horecaVisitDetailSchema = z.object({
  visitId: uuid,
  picRole: z.string().trim().max(80).optional().nullable(),
  visitPurpose: z.enum(['SALES', 'FOLLOW_UP', 'PROGRAM', 'NEW_OUTLET', 'COMPLAINT', 'RELATIONSHIP', 'OTHER']),
  result: optText(2000),
  nextFollowUpDate: isoDate.optional().nullable(),
});
export const horecaSaleSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  saleDate: isoDate,
  productVariantId: uuid,
  quantity,
  unit: z.string().trim().min(1).max(20),
  unitPrice: money.optional().nullable(),
  isOrder: z.boolean().default(true),
  stockQuantity: z.number().nonnegative().optional().nullable(),
  restockFrequency: z.string().trim().max(40).optional().nullable(),
  dataNature: dataNature.default('ACTUAL'),
});
export const horecaProgramSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  programType: z.enum(['POSM', 'DISPLAY', 'BRANDING', 'PROMOTION', 'EVENT', 'SAMPLING', 'OTHER']),
  description: optText(2000),
  startDate: isoDate,
  endDate: isoDate.optional().nullable(),
  budget: money.optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).default('DRAFT'),
});
export const programImplementationSchema = z.object({
  ...offlineMeta,
  programId: uuid,
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  implementationDate: isoDate,
  status: z.enum(['PLANNED', 'EXECUTED', 'PARTIAL', 'NOT_EXECUTED']),
  actualCost: money.optional().nullable(),
  realizationNote: optText(2000),
  effectivenessNote: optText(2000),
  photoFileId: uuid.optional().nullable(),
});

// ── POSM (Reguler & HORECA) ─────────────────────────────────
export const posmRecordSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  recordDate: isoDate,
  posmType: z.enum(['BANNER', 'POSTER', 'SHELF_TALKER', 'WOBBLER', 'DISPLAY_RACK', 'CHILLER', 'MENU_BRANDING', 'TABLE_TENT', 'OTHER']),
  status: z.enum(['INSTALLED', 'MISSING', 'DAMAGED', 'NOT_APPLICABLE']),
  quantity: z.number().int().nonnegative().optional().nullable(),
  notes: optText(1000),
  photoFileId: uuid.optional().nullable(),
});

// ── SPG Reguler ─────────────────────────────────────────────
export const availabilityBatchSchema = z.object({
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  recordDate: isoDate,
  items: z.array(z.object({
    clientId: uuid,
    productVariantId: uuid,
    isAvailable: z.boolean(),
    stockQuantity: z.number().nonnegative().optional().nullable(),
    oosReason: z.string().trim().max(120).optional().nullable(),
    lastRestockDate: isoDate.optional().nullable(),
  }).refine((i) => i.isAvailable || !!i.oosReason, { message: 'Out-of-stock needs a reason', path: ['oosReason'] })).min(1).max(300),
});
export const visibilityRecordSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  recordDate: isoDate,
  companyFacing: z.number().int().nonnegative(),
  competitorFacing: z.number().int().nonnegative(),
  totalCategoryFacing: z.number().int().nonnegative(),
  hasDisplay: z.boolean().default(false),
  displayType: z.string().trim().max(60).optional().nullable(),
  hasPromotion: z.boolean().default(false),
  promotionDetail: optText(1000),
  notes: optText(1000),
  photoFileId: uuid.optional().nullable(),
}).refine((v) => v.companyFacing + v.competitorFacing <= v.totalCategoryFacing, {
  message: 'Company + competitor facing cannot exceed total category facing', path: ['totalCategoryFacing'],
});
export const outletOrderSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  visitId: uuid.optional().nullable(),
  orderDate: isoDate,
  status: z.enum(['ORDERED', 'CONFIRMED', 'DELIVERED', 'CANCELLED']).default('ORDERED'),
  isRestock: z.boolean().default(false),
  notes: optText(1000),
  items: z.array(z.object({
    productVariantId: uuid,
    quantity,
    unit: z.string().trim().min(1).max(20),
    unitPrice: money,
  })).min(1).max(100),
});
export const recordDecisionSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optText(500),
});

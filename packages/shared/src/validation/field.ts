import { z } from 'zod';
import { uuid, isoDate, gps, optText, offlineMeta } from './common';

export const attendanceCheckInSchema = z.object({
  ...offlineMeta,
  gps: gps.optional().nullable(),
  photoFileId: uuid.optional().nullable(),
  note: optText(500),
});
export const attendanceCheckOutSchema = z.object({
  clientRecordedAt: z.iso.datetime({ offset: true }).optional(),
  gps: gps.optional().nullable(),
  note: optText(500),
});
export const attendanceOverrideSchema = z.object({
  spgId: uuid,
  workDate: isoDate,
  status: z.enum(['CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LEAVE']),
  checkInAt: z.iso.datetime({ offset: true }).optional(),
  checkOutAt: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(5).max(500),
});

export const visitCheckInSchema = z.object({
  ...offlineMeta,
  outletId: uuid,
  visitPlanId: uuid.optional().nullable(),
  gps: gps.optional().nullable(),
  purpose: optText(300),
});
export const visitCheckOutSchema = z.object({
  clientRecordedAt: z.iso.datetime({ offset: true }).optional(),
  gps: gps.optional().nullable(),
  outcome: optText(2000),
  notes: optText(2000),
  picMet: z.string().trim().max(120).optional().nullable(),
  followUpAction: optText(1000),
  orderStatus: z.enum(['NO_ORDER', 'ORDERED', 'CONFIRMED', 'DELIVERED', 'CANCELLED']).optional().nullable(),
});
export const visitEvidenceSchema = z.object({
  fileId: uuid,
  evidenceType: z.enum(['OUTLET_FRONT', 'SHELF', 'DISPLAY', 'POSM', 'COMPETITOR', 'RECEIPT', 'FORM', 'OTHER']),
  caption: optText(300),
  gps: gps.optional().nullable(),
});
export const visitOverrideSchema = z.object({
  geofenceStatus: z.enum(['INSIDE', 'OUTSIDE', 'UNKNOWN']).optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  reason: z.string().trim().min(5).max(500),
});
export const visitPlanSchema = z.object({
  spgId: uuid,
  items: z.array(z.object({ outletId: uuid, plannedDate: isoDate, note: optText(300) })).min(1).max(500),
});

/** Channel-specific daily-report content – three separate schemas, never one generic form. */
export const grosirReportContent = z.object({
  wholesalersVisited: z.number().int().nonnegative(),
  retailersRecorded: z.number().int().nonnegative(),
  marketHighlights: optText(2000),
  competitorHighlights: optText(2000),
  stockIssues: optText(2000),
});
export const horecaReportContent = z.object({
  outletsVisited: z.number().int().nonnegative(),
  newOutletsApproached: z.number().int().nonnegative(),
  programsExecuted: z.number().int().nonnegative(),
  keyAccountNotes: optText(2000),
  competitorHighlights: optText(2000),
});
export const regulerReportContent = z.object({
  outletsVisited: z.number().int().nonnegative(),
  ordersTaken: z.number().int().nonnegative(),
  oosFindings: optText(2000),
  displayNotes: optText(2000),
  competitorHighlights: optText(2000),
});
export const dailyReportSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('WHOLESALER'), content: grosirReportContent }),
  z.object({ channel: z.literal('HORECA'), content: horecaReportContent }),
  z.object({ channel: z.literal('REGULAR'), content: regulerReportContent }),
]).and(z.object({
  ...offlineMeta,
  reportDate: isoDate,
  summary: optText(4000),
  issues: optText(4000),
  submit: z.boolean().default(true),
}));
export const reportReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REVISION_REQUIRED']),
  note: optText(1000),
});

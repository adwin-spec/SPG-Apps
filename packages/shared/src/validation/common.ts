import { z } from 'zod';

export const uuid = z.uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
export const isoDateTime = z.iso.datetime({ offset: true });
export const money = z.number().nonnegative().max(1e13);
export const quantity = z.number().positive('Quantity must be greater than zero').max(1e9);
export const trimmed = (max = 200) => z.string().trim().min(1).max(max);
export const optText = (max = 2000) => z.string().trim().max(max).optional().nullable();

export const gps = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().int().nonnegative().max(100000).optional().nullable(),
});
export type Gps = z.infer<typeof gps>;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().regex(/^[a-zA-Z_.]+:(asc|desc)$/).optional(),
  q: z.string().trim().max(120).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

/** Shared analytic filter (dashboards, reports, exports – export must honour the same filter). */
export const analyticsFilter = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.enum(['GROSIR', 'HORECA', 'REGULER']).optional(),
  regionId: uuid.optional(),
  areaId: uuid.optional(),
  districtId: uuid.optional(),
  subdistrictId: uuid.optional(),
  supervisorId: uuid.optional(),
  spgId: uuid.optional(),
  outletId: uuid.optional(),
  productId: uuid.optional(),
  productVariantId: uuid.optional(),
  competitorId: uuid.optional(),
  brandId: uuid.optional(),
});
export type AnalyticsFilter = z.infer<typeof analyticsFilter>;

/** Fields present on every offline-capable write (ADR D7). */
export const offlineMeta = {
  clientId: uuid,
  clientRecordedAt: isoDateTime.optional(),
};

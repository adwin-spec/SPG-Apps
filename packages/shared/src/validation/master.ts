import { z } from 'zod';
import { uuid, isoDate, trimmed, optText, money } from './common';

const code = z.string().trim().min(1).max(32).regex(/^[A-Z0-9_-]+$/i, 'Letters, digits, - and _ only');

export const userCreateSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  fullName: trimmed(160),
  phone: z.string().trim().max(32).optional().nullable(),
  password: z.string().min(10).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
  roleCodes: z.array(z.string()).min(1),
  regionId: uuid.optional().nullable(),
  areaId: uuid.optional().nullable(),
});
export const userUpdateSchema = z.object({
  fullName: trimmed(160).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  roleCodes: z.array(z.string()).min(1).optional(),
  regionId: uuid.optional().nullable(),
  areaId: uuid.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const regionSchema = z.object({ code, name: trimmed(120), companyId: uuid.optional() });
export const areaSchema = z.object({ code, name: trimmed(120), regionId: uuid });
export const districtSchema = z.object({ code, name: trimmed(120), areaId: uuid });
export const subdistrictSchema = z.object({ code, name: trimmed(120), districtId: uuid });
export const territorySchema = z.object({ code, name: trimmed(120), areaId: uuid, description: optText(500) });
export const supervisorSchema = z.object({ userId: uuid, areaId: uuid });

export const spgCategoryCode = z.enum(['GROSIR', 'HORECA', 'REGULER']);
export const spgCreateSchema = z.object({
  employeeCode: code,
  fullName: trimmed(160),
  phone: z.string().trim().max(32).optional().nullable(),
  category: spgCategoryCode,
  joinDate: isoDate,
  areaId: uuid,
  territoryId: uuid.optional().nullable(),
  supervisorId: uuid.optional().nullable(),
  /** Creates a login for the SPG when provided. */
  login: z.object({ email: z.email().transform((v) => v.toLowerCase()), password: z.string().min(10).max(128) }).optional(),
});
export const spgUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  fullName: trimmed(160).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED']).optional(),
  category: spgCategoryCode.optional(),
  endDate: isoDate.optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});
export const spgAssignSchema = z.object({
  areaId: uuid,
  territoryId: uuid.optional().nullable(),
  supervisorId: uuid.optional().nullable(),
  effectiveFrom: isoDate,
  reason: z.string().trim().min(3).max(500),
});

export const outletChannel = z.enum(['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR']);
export const outletBase = z.object({
  name: trimmed(200),
  channel: outletChannel,
  categoryId: uuid.optional().nullable(),
  address: optText(500),
  districtId: uuid,
  subdistrictId: uuid.optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  geofenceRadiusM: z.number().int().min(10).max(5000).optional().nullable(),
  picName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  potentialClass: z.string().trim().max(16).optional().nullable(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED']).default('ACTIVE'),
  assignedSpgId: uuid.optional().nullable(),
});
export const outletCreateSchema = outletBase.extend({
  code: code.optional(),
  /** Retailer only: primary + alternative wholesalers. */
  primaryWholesalerId: uuid.optional().nullable(),
  alternativeWholesalerIds: z.array(uuid).max(10).optional(),
  /** Must be true to create when similar names exist (risk R6). */
  confirmNotDuplicate: z.boolean().optional(),
}).refine((v) => (v.latitude == null) === (v.longitude == null), { message: 'Latitude and longitude must be provided together', path: ['latitude'] });
export const outletUpdateSchema = outletBase.partial().extend({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});
export const retailerLinkSchema = z.object({
  wholesalerOutletId: uuid,
  relationType: z.enum(['PRIMARY', 'ALTERNATIVE']),
});

export const brandSchema = z.object({ code, name: trimmed(120), owner: z.enum(['COMPANY', 'COMPETITOR']), competitorId: uuid.optional().nullable() });
export const competitorSchema = z.object({ code, name: trimmed(160) });
export const productSchema = z.object({ code, name: trimmed(200), brandId: uuid, category: z.string().trim().max(80).optional().nullable() });
export const productVariantSchema = z.object({
  productId: uuid, sku: z.string().trim().min(1).max(60), name: trimmed(200),
  size: z.string().trim().max(40).optional().nullable(), unit: trimmed(20),
  packSize: z.number().int().positive().optional().nullable(), listPrice: money.optional().nullable(),
});
export const competitorProductSchema = z.object({
  competitorId: uuid, brandId: uuid, sku: z.string().trim().max(60).optional().nullable(),
  name: trimmed(200), variant: z.string().trim().max(80).optional().nullable(), unit: z.string().trim().max(20).optional().nullable(),
});

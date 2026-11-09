import { safeDivide, pct, shareOfShelf } from './math';
import { distanceMeters, evaluateGeofence } from './geo';
import { normalizeOutletName } from './text';
import { jakartaDate, jakartaLocalToUtc, monthRange } from './time';
import { visibilityRecordSchema, transactionItemSchema, retailerTransactionSchema } from '../index';

describe('math', () => {
  it('safeDivide never returns Infinity/NaN', () => {
    expect(safeDivide(5, 0)).toBeNull();
    expect(safeDivide(null, 3)).toBeNull();
    expect(safeDivide(0, 4)).toBe(0);
    expect(pct(1, 3)).toBe(33.33);
  });
  it('share of shelf is null when total facing is zero', () => {
    expect(shareOfShelf(0, 0)).toBeNull();
    expect(shareOfShelf(3, 12)).toBe(25);
    expect(() => shareOfShelf(13, 12)).toThrow();
  });
});

describe('geo', () => {
  const outlet = { lat: -6.2, lng: 106.816666 };
  it('computes haversine distance', () => {
    expect(Math.round(distanceMeters(outlet, { lat: -6.201, lng: 106.816666 }))).toBe(111);
  });
  it('classifies geofence inside / outside / unknown', () => {
    expect(evaluateGeofence({ lat: -6.2005, lng: 106.816666, accuracyM: 10 }, outlet, 150, 200).status).toBe('INSIDE');
    expect(evaluateGeofence({ lat: -6.21, lng: 106.816666, accuracyM: 10 }, outlet, 150, 200).status).toBe('OUTSIDE');
    expect(evaluateGeofence({ lat: -6.2, lng: 106.81, accuracyM: 500 }, outlet, 150, 200).status).toBe('UNKNOWN');
    expect(evaluateGeofence({ lat: -6.2, lng: 106.81 }, { lat: null, lng: null }, 150, 200).reason).toBe('OUTLET_HAS_NO_GPS');
    expect(evaluateGeofence({ lat: 0, lng: 0 }, outlet, 150, 200).reason).toBe('DEVICE_GPS_INVALID');
  });
});

describe('text', () => {
  it('normalises outlet name variants to the same key', () => {
    expect(normalizeOutletName('TOKO  Sumber-Rejeki.')).toBe('sumber rejeki');
    expect(normalizeOutletName('Tk. Sumber Rejeki')).toBe('sumber rejeki');
    expect(normalizeOutletName('Toko')).toBe('toko');
  });
});

describe('time', () => {
  it('derives Jakarta business date from UTC', () => {
    expect(jakartaDate(new Date('2026-11-09T18:30:00Z'))).toBe('2026-11-10');
    expect(jakartaDate(new Date('2026-11-09T16:59:00Z'))).toBe('2026-11-09');
  });
  it('converts local time to UTC', () => {
    expect(jakartaLocalToUtc('2026-11-09', '21:00').toISOString()).toBe('2026-11-09T14:00:00.000Z');
  });
  it('builds month ranges incl. December rollover', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });
});

describe('validation', () => {
  const id = '6f1c2f2e-5d0a-4a43-9a68-0d0b1a0b3c11';
  it('rejects facing totals that do not add up', () => {
    const r = visibilityRecordSchema.safeParse({ clientId: id, outletId: id, recordDate: '2026-11-09', companyFacing: 8, competitorFacing: 5, totalCategoryFacing: 10 });
    expect(r.success).toBe(false);
  });
  it('rejects negative quantities and company lines without SKU', () => {
    expect(transactionItemSchema.safeParse({ productOwner: 'COMPANY', productVariantId: id, quantity: -1, unit: 'pcs' }).success).toBe(false);
    expect(transactionItemSchema.safeParse({ productOwner: 'COMPANY', quantity: 1, unit: 'pcs' }).success).toBe(false);
    expect(transactionItemSchema.safeParse({ productOwner: 'COMPETITOR', brandText: 'X', quantity: 1, unit: 'pcs' }).success).toBe(true);
  });
  it('requires at least one item per transaction', () => {
    expect(retailerTransactionSchema.safeParse({ clientId: id, retailerOutletId: id, transactionDate: '2026-11-09', items: [] }).success).toBe(false);
  });
});

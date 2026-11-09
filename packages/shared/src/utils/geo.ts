const EARTH_RADIUS_M = 6_371_000;

export interface LatLng { lat: number; lng: number }

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeofenceResult = { status: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN'; distanceM: number | null; reason?: string };

/**
 * Evaluates a geofence. UNKNOWN when outlet has no coordinates, the device position is invalid,
 * or GPS accuracy is worse than `maxAccuracyM` (we never guess).
 */
export function evaluateGeofence(
  device: { lat?: number | null; lng?: number | null; accuracyM?: number | null },
  outlet: { lat?: number | null; lng?: number | null },
  radiusM: number,
  maxAccuracyM: number,
): GeofenceResult {
  if (!isValidCoordinate(outlet.lat, outlet.lng)) return { status: 'UNKNOWN', distanceM: null, reason: 'OUTLET_HAS_NO_GPS' };
  if (!isValidCoordinate(device.lat, device.lng)) return { status: 'UNKNOWN', distanceM: null, reason: 'DEVICE_GPS_INVALID' };
  const d = Math.round(distanceMeters({ lat: device.lat!, lng: device.lng! }, { lat: outlet.lat!, lng: outlet.lng! }));
  if (device.accuracyM != null && device.accuracyM > maxAccuracyM) return { status: 'UNKNOWN', distanceM: d, reason: 'GPS_ACCURACY_TOO_LOW' };
  // Allow the reported accuracy as tolerance so a good-faith reading at the edge is not penalised.
  const tolerance = Math.min(device.accuracyM ?? 0, radiusM);
  return { status: d <= radiusM + tolerance ? 'INSIDE' : 'OUTSIDE', distanceM: d };
}

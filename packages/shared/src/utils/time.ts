/** Business timezone. Storage is always UTC; this is only for business-date derivation & display. */
export const BUSINESS_TZ = 'Asia/Jakarta';
const JAKARTA_OFFSET_MIN = 7 * 60; // WIB has no DST

/** Returns the Asia/Jakarta calendar date (YYYY-MM-DD) of a UTC instant. */
export function jakartaDate(instant: Date = new Date()): string {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Converts a Jakarta local date + "HH:mm" into the UTC instant. */
export function jakartaLocalToUtc(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const utc = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) - JAKARTA_OFFSET_MIN * 60_000;
  return new Date(utc);
}

/** First day of month (YYYY-MM-01) for a YYYY-MM or YYYY-MM-DD string. */
export function periodMonth(value: string): string {
  if (!/^\d{4}-\d{2}/.test(value)) throw new Error(`Invalid period: ${value}`);
  return `${value.slice(0, 7)}-01`;
}

/** Inclusive start / exclusive end dates for a period month. */
export function monthRange(period: string): { start: string; endExclusive: string } {
  const start = periodMonth(period);
  const y = +start.slice(0, 4);
  const m = +start.slice(5, 7);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, endExclusive: next };
}

export function formatJakarta(iso: string | Date | null | undefined, withTime = true): string {
  if (!iso) return '–';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: BUSINESS_TZ, day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(d);
}

import { formatJakarta } from '@tanda/shared';

const nf = new Intl.NumberFormat('id-ID');
const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export const fmtNum = (v: unknown) => (v == null || v === '' ? '–' : nf.format(Number(v)));
export const fmtDec = (v: unknown, d = 1) => (v == null || v === '' ? '–' : (d === 2 ? nf2 : nf1).format(Number(v)));
export const fmtPct = (v: unknown) => (v == null || v === '' ? '–' : `${nf1.format(Number(v))}%`);
export function fmtIdr(v: unknown, compact = false) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  if (compact) {
    if (Math.abs(n) >= 1e9) return `Rp ${nf1.format(n / 1e9)} M`;
    if (Math.abs(n) >= 1e6) return `Rp ${nf1.format(n / 1e6)} jt`;
    if (Math.abs(n) >= 1e3) return `Rp ${nf1.format(n / 1e3)} rb`;
  }
  return `Rp ${nf.format(Math.round(n))}`;
}
export const fmtDate = (v: unknown) => (v ? formatJakarta(String(v), false) : '–');
export const fmtDateTime = (v: unknown) => (v ? formatJakarta(String(v), true) : '–');
export const isoDay = (v: unknown) => (v ? String(v).slice(0, 10) : '');
export const humanize = (s: unknown) => (s == null ? '–' : String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));

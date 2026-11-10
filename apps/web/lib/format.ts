const nf = new Intl.NumberFormat('id-ID');
const dfDate = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' });
const dfTime = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
export const fmtNum = (v: unknown) => (v == null || v === '' ? '–' : nf.format(Number(v)));
export const fmtIdr = (v: unknown) => (v == null || v === '' || !Number(v) ? '–' : `Rp ${nf.format(Math.round(Number(v)))}`);
export const fmtDate = (v: unknown) => (v ? dfDate.format(new Date(String(v))) : '–');
export const fmtTime = (v: unknown) => (v ? dfTime.format(new Date(String(v))) : '–');
export const fmtDateTime = (v: unknown) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '–');
export const humanize = (s: unknown) => (s == null ? '–' : String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));

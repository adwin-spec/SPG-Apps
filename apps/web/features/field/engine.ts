/** Mesin form sisi HP. Logikanya sama dengan apps/api/app/services/formengine.py:
 *  definisi pertanyaan TIDAK ditulis di sini, melainkan diambil dari backend (GET /api/v1/forms). */
import type { Kec, ReportType } from '@/lib/types';

export type Opt = string | [string, string];
export interface Cond { f?: string; eq?: unknown; ne?: unknown; in?: unknown[]; sum_gt?: number; sum_eq?: number; all?: Cond[]; any?: Cond[] }
export interface Question {
  id: string; label: string; type: 'single' | 'multi' | 'text' | 'textarea' | 'number' | 'variants' | 'stok' | 'confirm' | 'kecamatan' | 'photo' | 'brandcounts' | 'gps';
  /** gps: langsung ambil lokasi saat form dibuka. */ auto?: boolean;
  required: boolean; hint?: string; placeholder?: string; text?: string; options?: Opt[] | { by: string; map: Record<string, Opt[]> } | { variants: true; extra: string[] };
  show?: Cond; suggest?: 'brands' | 'grosirs' | 'outlets'; capture?: 'user' | 'environment'; rows?: number; titlecase?: boolean; location?: boolean;
  rules?: { min?: number; min_message?: string; lte_field?: string; lte_message?: string };
  /** Nama kolom singkat untuk Excel & halaman Persetujuan. */ col?: string;
}
export interface Section { key: string; title: string; none_label: string; questions: Question[] }
export interface FormDef { title: string; start_title: string; entry_word: string; entry_hint: string; title_field: string; location_field: string; entry_location: string;
  start: Question[]; entry: Question[]; sections: Section[]; closing: Question[] }
export interface FormsPayload { types: Record<ReportType, string>; forms: Record<ReportType, FormDef>; settings: { brand: string; variants: string[]; grosirs: string[] };
  supervisors: { name: string; cover: { level: 'KAB' | 'KEC'; kode: string }[] }[]; options: Record<string, Opt[]> }
export type Answers = Record<string, any>;

export const val = (o: Opt) => (Array.isArray(o) ? o[0] : o);
export const lab = (o: Opt) => (Array.isArray(o) ? o[1] : o);
export const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const titleCase = (s: string) => norm(s).split(' ').map((w) => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
export const sumVariants = (m: unknown) => (m && typeof m === 'object' ? Object.values(m as Record<string, unknown>).reduce<number>((a, b) => a + (Number(b) || 0), 0) : 0);

export function optionsOf(q: Question, a: Answers, variants: string[]): Opt[] {
  const o = q.options;
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if ('by' in o) return o.map[String(a[o.by])] ?? [];
  return [...variants, ...o.extra];
}

export function cond(c: Cond | undefined, a: Answers): boolean {
  if (!c) return true;
  if (c.all) return c.all.every((x) => cond(x, a));
  if (c.any) return c.any.some((x) => cond(x, a));
  const v = a[c.f!];
  if (c.sum_gt != null) return sumVariants(v) > c.sum_gt;
  if (c.sum_eq != null) return sumVariants(v) === c.sum_eq;
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return !!v && v !== c.ne;
  if (c.in) return c.in.includes(v);
  return !!v;
}

const empty = (v: unknown) => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);

/** Pertanyaan yang tampil + jawaban yang dibersihkan (jawaban pertanyaan tersembunyi dibuang). */
export function visible(qs: Question[], a: Answers, variants: string[]): { shown: Question[]; clean: Answers } {
  const clean: Answers = {}; const shown: Question[] = [];
  for (const q of qs) {
    if (!cond(q.show, clean)) continue;
    shown.push(q);
    let v = a[q.id];
    if (q.type === 'single' && v != null && !optionsOf(q, clean, variants).some((o) => val(o) === v)) v = undefined;
    if (!empty(v)) clean[q.id] = v;
  }
  return { shown, clean };
}

export function validate(qs: Question[], a: Answers, variants: string[]): Record<string, string> {
  const { shown, clean } = visible(qs, a, variants); const e: Record<string, string> = {};
  for (const q of shown) {
    const v = clean[q.id];
    if (q.required && (empty(v) || (q.type === 'stok' && variants.some((x) => !(v ?? {})[x]))))
      e[q.id] = q.type === 'stok' ? 'Pilih stok tiap varian dulu ya' : ({ confirm: 'Centang dulu ya', single: 'Pilih salah satu dulu', kecamatan: 'Pilih kecamatannya dari daftar', photo: 'Ambil foto dulu', gps: 'Lokasinya belum tercatat' } as Record<string, string>)[q.type] ?? 'Ini belum diisi';
    if (q.required && q.type === 'brandcounts' && !(v ?? []).some((r: any) => norm(r?.merek))) e[q.id] = 'Isi minimal satu merek ya';
    const r = q.rules;
    if (r && typeof v === 'number') {
      if (r.min != null && v < r.min) e[q.id] = r.min_message ?? `Minimal ${r.min}`;
      if (r.lte_field && typeof clean[r.lte_field] === 'number' && v > clean[r.lte_field]) e[q.id] = r.lte_message ?? 'Terlalu besar';
    }
  }
  return e;
}

// ── master wilayah untuk pencarian kecamatan (disimpan di HP agar bisa dipakai offline) ──
export interface KecIndex { list: Kec[]; byKode: Map<string, Kec> }
export function indexKec(rows: { kode: string; nama: string; provKode: string; provinsi: string; kecamatan: { kode: string; nama: string }[] }[]): KecIndex {
  const list = rows.flatMap((k) => k.kecamatan.map((c) => ({ kode: c.kode, nama: c.nama, kab: k.nama, kabKode: k.kode, prov: k.provinsi, provKode: k.provKode })));
  return { list, byKode: new Map(list.map((c) => [c.kode, c])) };
}
export function searchKec(ix: KecIndex, q: string, preferKab?: string): Kec[] {
  const t = q.trim().toLowerCase(); if (t.length < 2) return [];
  const score = (c: Kec) => (c.nama.toLowerCase().startsWith(t) ? 0 : 2) + (preferKab && c.kabKode === preferKab ? 0 : 1);
  return ix.list.filter((c) => c.nama.toLowerCase().includes(t) || (t.length > 3 && c.kab.toLowerCase().includes(t)))
    .sort((a, b) => score(a) - score(b) || a.nama.localeCompare(b.nama)).slice(0, 15);
}
export const shortKab = (k: string) => String(k || '').replace(/^Kabupaten Administrasi /, 'Kab. Adm. ').replace(/^Kabupaten /, 'Kab. ').replace(/^Kota Administrasi /, 'Kota Adm. ');
export const kecFull = (x: any) => (!x ? '–' : typeof x === 'string' ? x : `${x.nama} · ${shortKab(x.kab)}`);

export const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draf', REVISION: 'Sedang diperbaiki', SUBMITTED: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };
export const labelOfStatus = (s: string) => STATUS_LABEL[s] ?? s;

export interface Gps { lat: number; lon: number; acc?: number | null; at?: string }
/** Ambil lokasi HP. Butuh HTTPS (atau localhost) dan izin lokasi dari pengguna. */
export function getGps(): Promise<Gps> {
  return new Promise((res, rej) => {
    if (!('geolocation' in navigator)) return rej(new Error('HP/browser ini tidak mendukung lokasi.'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), at: new Date().toISOString() }),
      (e) => rej(new Error(e.code === 1 ? 'Izin lokasi ditolak. Buka pengaturan browser → izinkan Lokasi untuk aplikasi ini, lalu coba lagi.'
        : e.code === 3 ? 'Lokasi belum ketemu (sinyal GPS lemah). Coba di tempat lebih terbuka, lalu ketuk lagi.' : 'Lokasi tidak bisa diambil. Pastikan GPS HP menyala.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
export const mapsLink = (g: Gps) => `https://www.google.com/maps?q=${g.lat},${g.lon}`;

'use client';
/** Grafik dashboard (SVG murni). Aturan: satu sumbu, label angka selektif, tooltip di setiap mark,
 *  tampilan tabel untuk setiap grafik. Palet monokrom; aksen hanya untuk sorotan:
 *   hitam = satu seri netral        merah redup = Tanda Tambah / sorotan        abu = kompetitor / pembanding
 *   tingkatan abu (terang→hitam) = kategori berurutan
 *  Palet divalidasi dengan validator dataviz terhadap permukaan kaca #fbfbfb. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtNum } from '@/lib/format';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassPanel } from '@/components/ui/glass-panel';

export const C = { tt: '#d94a43', ink: '#111111', comp: '#a6a6a6', light: '#c9c9c9', grid: 'rgba(0,0,0,.07)', axis: 'rgba(0,0,0,.18)', surface: '#fbfbfb' };
/** Tingkatan abu → hitam untuk kategori berurutan (lolos uji --ordinal di atas #fbfbfb). */
export const RAMP = ['#a8a8a8', '#858585', '#5e5e5e', '#3a3a3a', '#111111'];
const rampFor = (n: number) => (n <= 1 ? [RAMP[2]] : Array.from({ length: n }, (_, i) => RAMP[Math.round((i * (RAMP.length - 1)) / (n - 1))]));
const inkOn = (hex: string) => (['#a8a8a8', '#858585', '#a6a6a6', '#c9c9c9'].includes(hex) ? '#111111' : '#ffffff');
const toneColor = (t?: string | null) => (t === 'tt' ? C.tt : t === 'comp' ? C.comp : t === 'muted' ? C.light : C.ink);
const pctText = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '–');
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(0);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
function niceMax(v: number) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

/** Tooltip: nilai di depan (tebal), label sesudahnya. Teks disisipkan sebagai teks biasa (aman). */
function Tip({ tip }: { tip: { x: number; y: number; value: string; label: string } | null }) {
  if (!tip) return null;
  return <div role="status" className="glass-elevated pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap !rounded-glass-sm px-2.5 py-1.5 text-xs"
    style={{ left: tip.x, top: tip.y - 8 }}><b className="num">{tip.value}</b> <span className="text-ink-secondary">{tip.label}</span></div>;
}

/** Bingkai panel grafik (glass) + tombol tampilan tabel. */
export function ChartCard({ title, sub, span, table, children, lazy = true }: { title: string; sub?: string; span: string; table?: { columns: string[]; rows: (string | number)[][] }; children: React.ReactNode; lazy?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  return <GlassPanel title={title} subtitle={sub} className={span} interactive lazy={lazy}
    actions={table && <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
      className="rounded-full border border-line-strong bg-white/60 px-2.5 py-1 text-2xs font-semibold text-ink-secondary transition-colors hover:bg-white aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white">{asTable ? 'Grafik' : 'Tabel'}</button>}>
    {asTable && table ? <MiniTable {...table} /> : children}
  </GlassPanel>;
}
export function MiniTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return <div className="glass-nested -mx-1 max-h-80 overflow-auto"><table className="glass-table"><thead><tr>{columns.map((c, i) => <th key={c} className={i ? 'r' : ''}>{c}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? 'r' : ''}>{typeof v === 'number' ? fmtNum(v) : v}</td>)}</tr>)}</tbody></table></div>;
}

/** Grafik mini 14 hari di kotak angka (dekoratif; angkanya ada di kotak). */
export function Sparkline({ values, dark }: { values: number[]; dark?: boolean }) {
  if (!values?.length || values.every((v) => !v)) return null;
  const max = Math.max(...values, 1); const w = 96, h = 26;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 6) + 3, h - 3 - (v / max) * (h - 6)]);
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-[26px] w-24 shrink-0" aria-hidden>
    <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={dark ? 'rgba(255,255,255,.55)' : C.comp} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={3} fill={dark ? '#ffffff' : C.ink} stroke={dark ? '#111111' : C.surface} strokeWidth={1.5} />
  </svg>;
}

/** Tren harian: garis 2px + area tipis, garis bantu vertikal mengikuti kursor. */
export function Trend({ points, unit }: { points: [string, number][]; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>(); const [i, setI] = useState<number | null>(null);
  const h = 200, m = { l: 34, r: 44, t: 14, b: 24 };
  const max = niceMax(Math.max(0, ...points.map((p) => p[1])));
  const iw = Math.max(10, w - m.l - m.r), ih = h - m.t - m.b;
  const x = (k: number) => m.l + (points.length < 2 ? iw / 2 : (k / (points.length - 1)) * iw); const y = (v: number) => m.t + ih - (v / max) * ih;
  const line = points.map((p, k) => `${k ? 'L' : 'M'}${x(k)},${y(p[1])}`).join('');
  const area = `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = points.at(-1); const total = points.reduce((a, p) => a + p[1], 0);
  const pick = (cx: number) => setI(Math.max(0, Math.min(points.length - 1, Math.round(((cx - m.l) / iw) * (points.length - 1)))));
  return <div ref={ref} className="relative">
    {w > 0 && <svg width={w} height={h} role="img" aria-label={`Tren: total ${fmtNum(total)} ${unit ?? ''}`} tabIndex={0} className="block touch-none outline-none"
      onPointerMove={(e) => pick(e.clientX - e.currentTarget.getBoundingClientRect().left)} onPointerLeave={() => setI(null)}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setI((v) => Math.max(0, (v ?? points.length) - 1)); if (e.key === 'ArrowRight') setI((v) => Math.min(points.length - 1, (v ?? -1) + 1)); }}
      onBlur={() => setI(null)}>
      {[0, max / 2, max].map((t) => <g key={t}><line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke={t ? C.grid : C.axis} strokeWidth={1} />
        <text x={m.l - 6} y={y(t) + 4} textAnchor="end" className="num fill-[#6e6e6e] text-[10px]">{fmtNum(t)}</text></g>)}
      <path d={area} fill={C.ink} opacity={0.06} /><path d={line} fill="none" stroke={C.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last && <><circle cx={x(points.length - 1)} cy={y(last[1])} r={4} fill={C.tt} stroke={C.surface} strokeWidth={2} />
        <text x={x(points.length - 1) + 8} y={y(last[1]) + 4} className="num fill-[#111111] text-[11px] font-bold">{fmtNum(last[1])}</text></>}
      {[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((k, j, a) => a.indexOf(k) === j && points[k]).map((k) =>
        <text key={k} x={x(k)} y={h - 6} textAnchor={k === 0 ? 'start' : k === points.length - 1 ? 'end' : 'middle'} className="fill-[#6e6e6e] text-[10px]">{shortDate(points[k][0])}</text>)}
      {i != null && <><line x1={x(i)} x2={x(i)} y1={m.t} y2={m.t + ih} stroke={C.ink} strokeWidth={1} /><circle cx={x(i)} cy={y(points[i][1])} r={4} fill={C.ink} stroke={C.surface} strokeWidth={2} /></>}
    </svg>}
    <Tip tip={i != null && w ? { x: x(i), y: y(points[i][1]), value: `${fmtNum(points[i][1])} ${unit ?? ''}`, label: shortDate(points[i][0]) } : null} />
  </div>;
}

/** Batang mendatar berperingkat (satu seri). Nilai di ujung batang. */
export function Bars({ rows, pct, unit, limit = 10 }: { rows: { label: string; n: number; tone?: string | null }[]; pct?: boolean; unit?: string; limit?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.n)); const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return <Empty />;
  return <ul className="grid gap-2.5">{rows.slice(0, limit).map((r, i) => {
    const share = pctText(r.n, total);
    return <li key={r.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,10rem)_1fr]"
      onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
      aria-label={`${r.label}: ${fmtNum(r.n)}${unit ?? ''}${pct ? `, ${share}` : ''}`}>
      <span className="truncate text-ink-secondary" title={r.label}>{r.label}</span>
      <span className="flex items-center gap-2">
        <span className="h-3 rounded-r-[4px] transition-opacity" style={{ width: r.n > 0 ? `${Math.max(1.5, (r.n / max) * 78)}%` : 0, background: toneColor(r.tone), opacity: hover == null || hover === i ? 1 : 0.55 }} />
        <span className="num shrink-0 font-semibold">{fmtNum(r.n)}{unit}{pct && <span className="ml-1 text-2xs font-normal text-ink-muted">{share}</span>}</span>
      </span></li>; })}</ul>;
}

/** Batang bersegmen tinggi: satu keseluruhan dibagi ≤ 6 bagian berurutan. */
export function Segments({ rows }: { rows: { label: string; n: number }[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const total = rows.reduce((a, r) => a + r.n, 0); const colors = rampFor(rows.length);
  if (!total) return <Empty />;
  return <div className="relative">
    <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={rows.map((r) => `${r.label} ${pctText(r.n, total)}`).join(', ')}>
      {rows.map((r, i) => r.n > 0 && <div key={r.label} className="flex h-full items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] font-bold"
        style={{ width: `${(r.n / total) * 100}%`, background: colors[i], color: inkOn(colors[i]) }}
        onPointerMove={(e) => { const b = e.currentTarget.parentElement!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: 0, value: `${fmtNum(r.n)} · ${pctText(r.n, total)}`, label: r.label }); }}
        onPointerLeave={() => setTip(null)}>{r.n / total >= 0.09 ? pctText(r.n, total).replace(/,\d%$/, '%') : ''}</div>)}
    </div>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-secondary">{rows.map((r, i) => <li key={r.label} className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[i] }} />{r.label}</li>)}</ul>
    <Tip tip={tip} />
  </div>;
}

/** Corong: setiap tahap bagian dari tahap sebelumnya. */
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const first = steps[0]?.n || 0; const colors = rampFor(steps.length);
  if (!first) return <Empty />;
  return <ol className="grid gap-2">{steps.map((s, i) => <li key={s.label} className="grid gap-1">
    <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate font-semibold">{s.label}</span>
      <span className="num shrink-0"><b>{fmtNum(s.n)}</b>{i > 0 && <span className="ml-1.5 text-2xs text-ink-muted">{pctText(s.n, steps[i - 1].n)} dari tahap sebelumnya</span>}</span></div>
    <div className="h-3.5 rounded-r-[4px]" style={{ width: s.n > 0 ? `${Math.max(1.5, (s.n / first) * 100)}%` : 0, background: colors[i] }} role="presentation" />
  </li>)}</ol>;
}

/** Komposisi per baris (100%): mis. stok Ada / Kosong / Tidak jual per varian. */
export function Stack({ keys, rows }: { keys: { key: string; label: string; tone: string }[]; rows: { label: string; values: Record<string, number> }[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; value: string; label: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!rows.some((r) => keys.some((k) => r.values[k.key]))) return <Empty />;
  return <div className="relative" ref={ref}>
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">{keys.map((k) => <li key={k.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: toneColor(k.tone) }} />{k.label}</li>)}</ul>
    <ul className="grid gap-2.5">{rows.map((r) => { const total = keys.reduce((a, k) => a + (r.values[k.key] || 0), 0);
      return <li key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 text-[13px]"><span className="truncate text-ink-secondary">{r.label}</span>
        <div className="flex h-6 gap-[2px]">{keys.map((k) => { const v = r.values[k.key] || 0; if (!v) return null; const col = toneColor(k.tone);
          return <div key={k.key} className="flex items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] font-bold" style={{ width: `${(v / total) * 100}%`, background: col, color: inkOn(col) }}
            onPointerMove={(e) => { const b = ref.current!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, value: `${fmtNum(v)} · ${pctText(v, total)}`, label: `${r.label} – ${k.label}` }); }}
            onPointerLeave={() => setTip(null)}>{v / total >= 0.12 ? pctText(v, total).replace(/,\d%$/, '%') : ''}</div>; })}</div></li>; })}</ul>
    <Tip tip={tip} />
  </div>;
}

function Empty() { return <EmptyState compact title="Belum ada data" hint="Datanya akan muncul di sini setelah laporan disetujui." />; }

/** Data tabel untuk setiap jenis grafik (tombol "Tabel"). */
export function tableOf(p: any): { columns: string[]; rows: (string | number)[][] } | undefined {
  if (p.kind === 'bars' || p.kind === 'segments') { const t = p.rows.reduce((a: number, r: any) => a + r.n, 0);
    return { columns: ['Kategori', p.unit === '%' ? 'Persen' : 'Jumlah', ...(p.unit === '%' ? [] : ['Persentase'])], rows: p.rows.map((r: any) => [r.label, r.n, ...(p.unit === '%' ? [] : [pctText(r.n, t)])]) }; }
  if (p.kind === 'funnel') return { columns: ['Tahap', 'Jumlah', '% dari tahap pertama'], rows: p.steps.map((s: any) => [s.label, s.n, pctText(s.n, p.steps[0]?.n || 0)]) };
  if (p.kind === 'stack') return { columns: ['Baris', ...p.keys.map((k: any) => k.label)], rows: p.rows.map((r: any) => [r.label, ...p.keys.map((k: any) => r.values[k.key] || 0)]) };
  if (p.kind === 'trend') return { columns: ['Tanggal', 'Nilai'], rows: p.points.filter((x: any) => x[1]).map((x: any) => [shortDate(x[0]), x[1]]) };
  return undefined;
}
export const useMemoTable = (p: any) => useMemo(() => tableOf(p), [p]);

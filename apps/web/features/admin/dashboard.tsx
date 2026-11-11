'use client';
/** Dashboard: angka & panel dihitung di backend (apps/api/app/services/dashboard.py); halaman ini hanya menampilkan. */
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Download, FileArchive, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNum } from '@/lib/format';
import { type ReportType, TYPE_LABEL, TYPES, type AuthUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/ui/glass-button';
import { ErrorBox, Skeleton } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/glass-card';
import { GlassContainer } from '@/components/ui/glass-container';
import { GlassDropdown } from '@/components/ui/glass-dropdown';
import { GlassPanel } from '@/components/ui/glass-panel';
import { GlassTable } from '@/components/ui/glass-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PlusMark } from '@/components/branding/plus-mark';
import { PageContainer, PageHeader } from '@/components/layout/page-container';
import { Photo } from '@/components/photo';
import { useToast } from '@/components/ui/toast';
import { shortKab } from '@/features/field/engine';
import { Bars, ChartCard, Funnel, Segments, Sparkline, Stack, Trend, tableOf } from './charts';
import { selectCls, useWilayah } from './hooks';
import { PointsMap } from './map';

type Cell = string | number | { text: string; geo?: string; tipe?: string };
interface Panel { kind: 'bars' | 'table' | 'gallery' | 'trend' | 'segments' | 'funnel' | 'stack' | 'map'; title: string; sub: string; span: number; [k: string]: any }
interface Dash { title: string; reports: number; truncated: boolean; spgOptions: string[]; tipeOptions: string[]; coverage: string[] | null; tiles: { k: string; v: string; d: string; spark?: number[] }[]; panels: Panel[]; insights: string[] }
/** Perubahan 7 hari terakhir dibanding 7 hari sebelumnya, dari grafik mini 14 hari. */
const deltaOf = (spark?: number[]) => { if (!spark || spark.length < 14) return null; const a = spark.slice(7).reduce((x, y) => x + y, 0), b = spark.slice(0, 7).reduce((x, y) => x + y, 0); return b ? { pct: Math.round(((a - b) / b) * 100), label: 'vs 7 hari sebelumnya' } : null; };
const BG: Record<ReportType, 'grosir' | 'horeca' | 'reguler'> = { GROSIR: 'grosir', HORECA: 'horeca', REGULER: 'reguler' };

export const SPAN: Record<number, string> = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6', 8: 'lg:col-span-8', 12: 'lg:col-span-12' };
const TYPE_TAG: Record<ReportType, string> = { GROSIR: 'SPG Grosir', HORECA: 'Survei HORECA', REGULER: 'SPG Reguler' };

export function DashboardView() {
  const { user } = useAuth(); const toast = useToast();
  const [f, setF] = useState({ type: 'GROSIR' as ReportType, days: '30', spg: '', spv: '', prov: '', kab: '', kec: '', tipe: '' });
  const [busy, setBusy] = useState('');
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['dash', f], queryFn: () => api<Dash>('/dashboard', { query: f }), placeholderData: (prev) => prev });
  const spvs = useQuery({ queryKey: ['users', 'SPV'], queryFn: () => api<AuthUser[]>('/users', { query: { role: 'SPV' } }), enabled: user?.role === 'ADMIN' });
  const wil = useWilayah();
  const provs = [...new Map((wil.data ?? []).map((k) => [k.provKode, k.provinsi])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const kabs = (wil.data ?? []).filter((k) => !f.prov || k.provKode === f.prov);
  const kecs = f.kab ? wil.data?.find((k) => k.kode === f.kab)?.kecamatan ?? [] : [];
  const d = q.data; const locOn = f.prov || f.kab || f.kec || f.tipe;
  const onCell = (c: Cell) => { if (typeof c === 'object' && c.geo) { if (f.kab) set({ kec: c.geo }); else set({ kab: c.geo, prov: c.geo.slice(0, 2) }); } else if (typeof c === 'object' && c.tipe) set({ tipe: c.tipe }); };
  const dl = async (key: string, path: string, query: Record<string, string>) => {
    setBusy(key);
    try { await download(path, query); } catch (e) { toast('error', (e as Error).message); } finally { setBusy(''); }
  };
  const fileFilter = (t: ReportType) => ({ ...f, type: t, tipe: t === f.type && t !== 'HORECA' ? f.tipe : '' });

  return <PageContainer preset={BG[f.type]}>
    <PageHeader eyebrow="Executive dashboard" title={d?.title ?? 'Dashboard'}
      description={d ? `${fmtNum(d.reports)} laporan disetujui · ${f.days} hari terakhir${d.coverage ? ` · wilayah Anda: ${d.coverage.join(', ') || 'belum ditetapkan'}` : ''}${d.truncated ? ' · data terpotong, persempit periode' : ''}` : 'Memuat…'}
      actions={<GlassDropdown label="Unduh Excel" icon={<Download className="h-4 w-4" />} variant="primary" loading={!!busy} items={[
        ...TYPES.map((t) => ({ label: TYPE_TAG[t], hint: 'Ringkasan, analisis + grafik, tren harian, data rinci', icon: <FileSpreadsheet className="h-4 w-4" />, onSelect: () => dl(t, '/dashboard/export.xlsx', fileFilter(t)) })),
        { label: 'Ketiganya (.zip)', hint: 'Tiga file Excel sekaligus', icon: <FileArchive className="h-4 w-4" />, onSelect: () => dl('all', '/dashboard/export-all.zip', { ...f, tipe: '' }) },
      ]} />} />

    {/* Panel filter: satu baris di atas semua grafik */}
    <GlassContainer level="elevated" className="enter relative z-20 mb-5 flex flex-wrap items-center gap-2 !rounded-glass-md p-2.5" role="group" aria-label="Filter dashboard">
      <div className="inline-flex rounded-glass-sm bg-black/[.05] p-1" role="group" aria-label="Kategori">{TYPES.map((t) => <button key={t} aria-pressed={f.type === t} onClick={() => set({ type: t, spg: '', tipe: '' })}
        className={cn('h-8 rounded-[8px] px-3.5 text-sm font-semibold transition-colors', f.type === t ? 'bg-ink text-white shadow-sm' : 'text-ink-secondary hover:text-ink')}>{TYPE_LABEL[t]}</button>)}</div>
      <select aria-label="Periode" className={selectCls} value={f.days} onChange={(e) => set({ days: e.target.value })}>{['7', '30', '90'].map((x) => <option key={x} value={x}>{x} hari terakhir</option>)}</select>
      {user?.role === 'ADMIN' && <select aria-label="Wilayah supervisor" className={selectCls} value={f.spv} onChange={(e) => set({ spv: e.target.value })}>
        <option value="">Semua supervisor</option><option value="_none">Tanpa SPV</option>{(spvs.data ?? []).map((s) => <option key={s.id} value={s.id}>Wilayah {s.name}</option>)}</select>}
      <select aria-label="SPG" className={selectCls} value={f.spg} onChange={(e) => set({ spg: e.target.value })}><option value="">Semua SPG</option>{(d?.spgOptions ?? []).map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Provinsi" className={selectCls} value={f.prov} onChange={(e) => set({ prov: e.target.value, kab: '', kec: '' })}><option value="">Semua provinsi</option>{provs.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <select aria-label="Kabupaten/kota" className={selectCls} value={f.kab} onChange={(e) => set({ kab: e.target.value, kec: '', prov: e.target.value ? e.target.value.slice(0, 2) : f.prov })}><option value="">Semua kab/kota</option>{kabs.map((k) => <option key={k.kode} value={k.kode}>{shortKab(k.nama)}</option>)}</select>
      <select aria-label="Kecamatan" className={selectCls} value={f.kec} disabled={!f.kab} onChange={(e) => set({ kec: e.target.value })}><option value="">{f.kab ? 'Semua kecamatan' : 'Kecamatan (pilih kab/kota)'}</option>{kecs.map((c) => <option key={c.kode} value={c.kode}>{c.nama}</option>)}</select>
      {!!d?.tipeOptions.length && <select aria-label="Tipe toko" className={selectCls} value={f.tipe} onChange={(e) => set({ tipe: e.target.value })}><option value="">{f.type === 'GROSIR' ? 'Semua pembeli' : 'Semua tipe outlet'}</option>{d.tipeOptions.map((t) => <option key={t}>{t}</option>)}</select>}
      {locOn && <GlassButton variant="ghost" size="sm" onClick={() => set({ prov: '', kab: '', kec: '', tipe: '' })}>Hapus filter wilayah</GlassButton>}
    </GlassContainer>

    {q.error && <ErrorBox error={q.error instanceof ApiError ? q.error : new Error('Gagal memuat dashboard')} />}
    {q.isLoading && <div className="grid gap-4"><Skeleton className="h-28" /><Skeleton className="h-72" /></div>}
    <div className={cn('transition-opacity duration-200', q.isFetching && !q.isLoading && 'opacity-60')}>
      {d && !d.tiles.length && <GlassContainer className="mb-5"><EmptyState title="Wawasan Anda akan muncul di sini" hint={<>Belum ada laporan yang disetujui untuk filter ini. Setujui laporan di <Link className="font-semibold underline underline-offset-4" href="/review">Persetujuan</Link>{user?.role === 'ADMIN' && <>, atau muat data contoh di <Link className="font-semibold underline underline-offset-4" href="/settings">Pengaturan</Link></>}.</>} /></GlassContainer>}
      {d && !!d.tiles.length && <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{d.tiles.map((t, i) =>
        <KpiCard key={t.k} label={t.k} value={t.v} detail={t.d} featured={i === 0} delta={deltaOf(t.spark)} spark={t.spark ? <Sparkline values={t.spark} dark={i === 0} /> : null} />)}</div>}
      {d && <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">{d.panels.map((p, i) => <Fragment key={`${f.type}-${i}`}>
        <PanelView p={p} onCell={onCell} onKec={(k) => set({ prov: k.provKode, kab: k.kabKode, kec: k.kode })} />
        {i === 0 && !!d.insights?.length && <Insights items={d.insights} />}
      </Fragment>)}</div>}
    </div>
  </PageContainer>;
}

function Insights({ items }: { items: string[] }) {
  return <GlassPanel level="dark" className="relative lg:col-span-4" title="Insight" subtitle="Temuan otomatis dari data yang disetujui">
    <PlusMark variant="solid-white" className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 opacity-[0.07]" />
    <ol className="relative grid gap-3">{items.map((t, i) => <li key={i} className="flex gap-3 text-sm leading-snug text-white/90">
      <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/12 text-2xs font-bold text-white">{i + 1}</span>{t}</li>)}</ol>
  </GlassPanel>;
}

function PanelView({ p, onCell, onKec }: { p: Panel; onCell: (c: Cell) => void; onKec: (k: { kode: string; kabKode: string; provKode: string }) => void }) {
  const span = SPAN[p.span] ?? 'lg:col-span-4';
  if (p.kind === 'map') return <ChartCard title={p.title} sub={p.sub} span={span} lazy={false}
    table={{ columns: ['Lokasi', 'Keterangan', 'Lat', 'Lon'], rows: (p.points as any[]).map((x) => [x.label, x.sub, x.lat.toFixed(5), x.lon.toFixed(5)]) }}>
    <PointsMap points={p.points} onPickKec={onKec} /></ChartCard>;
  if (p.kind === 'table') return <GlassPanel lazy title={p.title} subtitle={p.sub} className={span} bodyClassName="px-0 pb-0 pt-2"><Table p={p} onCell={onCell} /></GlassPanel>;
  if (p.kind === 'gallery') return <ChartCard title={p.title} sub={p.sub} span={span}><Gallery items={p.items} /></ChartCard>;
  return <ChartCard title={p.title} sub={p.sub} span={span} table={tableOf(p)}>
    {p.kind === 'trend' ? <Trend points={p.points} unit={p.unit} /> : p.kind === 'segments' ? <Segments rows={p.rows} /> : p.kind === 'funnel' ? <Funnel steps={p.steps} />
      : p.kind === 'stack' ? <Stack keys={p.keys} rows={p.rows} /> : <Bars rows={p.rows} pct={p.pct} unit={p.unit} />}
  </ChartCard>;
}

function Table({ p, onCell }: { p: Panel; onCell: (c: Cell) => void }) {
  const rows = (p.rows ?? []) as Cell[][]; const cols = p.columns as { label: string; num: boolean }[];
  if (!rows.length) return <EmptyState compact title={p.empty ?? 'Belum ada data'} />;
  return <GlassTable plain maxHeight="28rem"><thead><tr>{cols.map((c) => <th key={c.label} className={c.num ? 'r' : ''}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cols[j]?.num ? 'r' : ''}>
      {typeof c === 'object' && c ? <button className="text-left font-semibold underline decoration-ink/25 underline-offset-4 hover:decoration-ink" onClick={() => onCell(c)}>{c.text}</button> : typeof c === 'number' ? fmtNum(c) : c}</td>)}</tr>)}</tbody></GlassTable>;
}
function Gallery({ items }: { items?: { photo: any; cap: string }[] }) {
  if (!items?.length) return <EmptyState compact title="Belum ada foto" />;
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">{items.map((it, i) => <figure key={i} className="grid gap-1.5 text-2xs text-ink-muted">
    <Photo value={it.photo} alt={it.cap} className="aspect-square h-auto w-full rounded-glass-sm" /><figcaption>{it.cap}</figcaption></figure>)}</div>;
}

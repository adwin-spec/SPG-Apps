'use client';
/** Dashboard: angka & panel dihitung di backend (apps/api/app/services/dashboard.py); halaman ini hanya menampilkan. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FileArchive, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNum } from '@/lib/format';
import { type ReportType, TYPE_LABEL, TYPES, type AuthUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorBox, PageHeader, Skeleton } from '@/components/ui/card';
import { Photo } from '@/components/photo';
import { useToast } from '@/components/ui/toast';
import { shortKab } from '@/features/field/engine';
import { Bars, ChartCard, Funnel, Segments, Sparkline, Stack, Trend, tableOf } from './charts';
import { selectCls, useWilayah } from './hooks';

type Cell = string | number | { text: string; geo?: string; tipe?: string };
interface Panel { kind: 'bars' | 'table' | 'gallery' | 'trend' | 'segments' | 'funnel' | 'stack'; title: string; sub: string; span: number; [k: string]: any }
interface Dash { title: string; reports: number; truncated: boolean; spgOptions: string[]; tipeOptions: string[]; coverage: string[] | null; tiles: { k: string; v: string; d: string; spark?: number[] }[]; panels: Panel[] }

const SPAN: Record<number, string> = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6', 8: 'lg:col-span-8', 12: 'lg:col-span-12' };
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

  return <>
    <PageHeader title={d?.title ?? 'Dashboard'} description={d ? `${fmtNum(d.reports)} laporan disetujui · ${f.days} hari terakhir${d.coverage ? ` · wilayah Anda: ${d.coverage.join(', ') || 'belum ditetapkan'}` : ''}${d.truncated ? ' · data terpotong, persempit periode' : ''}` : 'Memuat…'} />

    {/* Unduh Excel: satu file per jenis SPG */}
    <section className="mb-4 flex flex-wrap items-center gap-2 rounded-md border-2 border-dashed border-ink/40 px-3 py-2.5" aria-label="Unduh Excel">
      <span className="mr-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><FileSpreadsheet className="h-4 w-4 text-tt" />Unduh Excel</span>
      {TYPES.map((t) => <Button key={t} size="sm" variant={t === f.type ? 'primary' : 'secondary'} loading={busy === t} onClick={() => dl(t, '/dashboard/export.xlsx', fileFilter(t))}>{TYPE_TAG[t]}</Button>)}
      <Button size="sm" variant="secondary" loading={busy === 'all'} onClick={() => dl('all', '/dashboard/export-all.zip', { ...f, tipe: '' })}><FileArchive className="h-4 w-4" />Ketiganya (.zip)</Button>
      <span className="text-2xs text-ink-muted">Filter periode, wilayah & SPG di bawah ikut berlaku.</span>
    </section>

    {/* Filter: satu baris di atas semua grafik */}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border-2 border-ink bg-paper-card p-0.5 shadow-hard-sm" role="group" aria-label="Kategori">{TYPES.map((t) => <button key={t} aria-pressed={f.type === t} onClick={() => set({ type: t, spg: '', tipe: '' })}
        className={cn('h-8 rounded px-3 text-sm font-bold', f.type === t ? 'bg-ink text-paper-card' : 'text-ink-secondary hover:text-ink')}>{TYPE_LABEL[t]}</button>)}</div>
      <select aria-label="Periode" className={selectCls} value={f.days} onChange={(e) => set({ days: e.target.value })}>{['7', '30', '90'].map((x) => <option key={x} value={x}>{x} hari terakhir</option>)}</select>
      {user?.role === 'ADMIN' && <select aria-label="Wilayah supervisor" className={selectCls} value={f.spv} onChange={(e) => set({ spv: e.target.value })}>
        <option value="">Semua supervisor</option><option value="_none">Tanpa SPV</option>{(spvs.data ?? []).map((s) => <option key={s.id} value={s.id}>Wilayah {s.name}</option>)}</select>}
      <select aria-label="SPG" className={selectCls} value={f.spg} onChange={(e) => set({ spg: e.target.value })}><option value="">Semua SPG</option>{(d?.spgOptions ?? []).map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Provinsi" className={selectCls} value={f.prov} onChange={(e) => set({ prov: e.target.value, kab: '', kec: '' })}><option value="">Semua provinsi</option>{provs.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <select aria-label="Kabupaten/kota" className={selectCls} value={f.kab} onChange={(e) => set({ kab: e.target.value, kec: '', prov: e.target.value ? e.target.value.slice(0, 2) : f.prov })}><option value="">Semua kab/kota</option>{kabs.map((k) => <option key={k.kode} value={k.kode}>{shortKab(k.nama)}</option>)}</select>
      <select aria-label="Kecamatan" className={selectCls} value={f.kec} disabled={!f.kab} onChange={(e) => set({ kec: e.target.value })}><option value="">{f.kab ? 'Semua kecamatan' : 'Kecamatan (pilih kab/kota)'}</option>{kecs.map((c) => <option key={c.kode} value={c.kode}>{c.nama}</option>)}</select>
      {!!d?.tipeOptions.length && <select aria-label="Tipe toko" className={selectCls} value={f.tipe} onChange={(e) => set({ tipe: e.target.value })}><option value="">{f.type === 'GROSIR' ? 'Semua pembeli' : 'Semua tipe outlet'}</option>{d.tipeOptions.map((t) => <option key={t}>{t}</option>)}</select>}
      {locOn && <Button variant="link" size="sm" onClick={() => set({ prov: '', kab: '', kec: '', tipe: '' })}>Hapus filter wilayah</Button>}
    </div>

    {q.error && <ErrorBox error={q.error instanceof ApiError ? q.error : new Error('Gagal memuat dashboard')} />}
    {q.isLoading && <Skeleton className="h-64" />}
    <div className={cn('transition-opacity', q.isFetching && !q.isLoading && 'opacity-60')}>
      {d && !d.tiles.length && <div className="mb-4 rounded-md border-2 border-ink bg-paper-card p-8 text-center text-sm text-ink-secondary shadow-hard">Belum ada laporan yang disetujui untuk filter ini. Setujui laporan di <Link className="font-semibold underline decoration-tt decoration-2" href="/review">Persetujuan</Link>{user?.role === 'ADMIN' && <>, atau muat data contoh di <Link className="font-semibold underline decoration-tt decoration-2" href="/settings">Pengaturan</Link></>}.</div>}
      {d && !!d.tiles.length && <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-md border-2 border-ink bg-paper-card shadow-hard sm:grid-cols-3 xl:grid-cols-6">{d.tiles.map((t, i) =>
        <div key={t.k} className={cn('border-ink/15 px-4 py-3', i && 'border-l', i >= 2 && 'max-sm:border-t', i >= 3 && 'sm:max-xl:border-t', i === 0 && 'bg-ink text-paper-card')}>
          <div className={cn('text-xs font-semibold', i === 0 ? 'text-comp-light' : 'text-ink-secondary')}>{t.k}</div>
          <div className="mt-1 text-[28px] font-bold leading-none">{t.v}</div>
          <div className={cn('mt-1 text-xs', i === 0 ? 'text-comp-light' : 'text-ink-muted')}>{t.d}</div>
          {t.spark && <Sparkline values={t.spark} />}</div>)}</div>}
      {d && <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">{d.panels.map((p, i) => <PanelView key={`${f.type}-${i}`} p={p} onCell={onCell} />)}</div>}
    </div>
  </>;
}

function PanelView({ p, onCell }: { p: Panel; onCell: (c: Cell) => void }) {
  const span = SPAN[p.span] ?? 'lg:col-span-4';
  if (p.kind === 'table') return <section className={cn('min-w-0 rounded-md border-2 border-ink bg-paper-card shadow-hard', span)}>
    <div className="border-b-2 border-ink px-4 py-3"><h2 className="text-sm font-bold uppercase tracking-wide">{p.title}</h2>{p.sub && <p className="text-xs text-ink-muted">{p.sub}</p>}</div>
    <Table p={p} onCell={onCell} /></section>;
  if (p.kind === 'gallery') return <ChartCard title={p.title} sub={p.sub} span={span}><Gallery items={p.items} /></ChartCard>;
  return <ChartCard title={p.title} sub={p.sub} span={span} table={tableOf(p)}>
    {p.kind === 'trend' ? <Trend points={p.points} unit={p.unit} /> : p.kind === 'segments' ? <Segments rows={p.rows} /> : p.kind === 'funnel' ? <Funnel steps={p.steps} />
      : p.kind === 'stack' ? <Stack keys={p.keys} rows={p.rows} /> : <Bars rows={p.rows} pct={p.pct} unit={p.unit} />}
  </ChartCard>;
}

function Table({ p, onCell }: { p: Panel; onCell: (c: Cell) => void }) {
  const rows = (p.rows ?? []) as Cell[][]; const cols = p.columns as { label: string; num: boolean }[];
  return <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr>{cols.map((c) => <th key={c.label} className={cn('whitespace-nowrap bg-paper-deep px-3 py-2 text-2xs font-bold uppercase tracking-wide text-ink-secondary', c.num ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border hover:bg-paper">{r.map((c, j) => <td key={j} className={cn('px-3 py-2', cols[j]?.num && 'num text-right')}>
      {typeof c === 'object' && c ? <button className="text-left font-semibold underline decoration-tt decoration-2 underline-offset-4 hover:text-tt" onClick={() => onCell(c)}>{c.text}</button> : typeof c === 'number' ? fmtNum(c) : c}</td>)}</tr>)}
      {!rows.length && <tr><td colSpan={cols.length} className="py-6 text-center text-ink-muted">{p.empty ?? 'Belum ada data'}</td></tr>}</tbody></table></div>;
}
function Gallery({ items }: { items?: { photo: any; cap: string }[] }) {
  if (!items?.length) return <p className="py-4 text-center text-sm text-ink-muted">Belum ada foto</p>;
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">{items.map((it, i) => <figure key={i} className="grid gap-1 text-2xs text-ink-muted">
    <Photo value={it.photo} alt={it.cap} className="aspect-square h-auto w-full border-2 border-ink" /><figcaption>{it.cap}</figcaption></figure>)}</div>;
}

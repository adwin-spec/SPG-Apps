'use client';
/** Dashboard generik: angka dan panel dihitung di backend (apps/api/app/services/dashboard.py); halaman ini hanya menampilkan. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNum } from '@/lib/format';
import { type ReportType, TYPE_LABEL, TYPES, type AuthUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorBox, PageHeader, Skeleton } from '@/components/ui/card';
import { Photo } from '@/components/photo';
import { shortKab } from '@/features/field/engine';
import { selectCls, useWilayah } from './hooks';

type Cell = string | number | { text: string; geo?: string; tipe?: string };
interface Panel { kind: 'bars' | 'table' | 'gallery'; title: string; sub: string; span: number; pct?: boolean; money?: boolean; empty?: string;
  rows?: any[]; columns?: { label: string; num: boolean }[]; items?: { photo: any; cap: string }[] }
interface Dash { title: string; reports: number; truncated: boolean; spgOptions: string[]; tipeOptions: string[]; coverage: string[] | null; tiles: { k: string; v: string; d: string }[]; panels: Panel[] }

const SPAN: Record<number, string> = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6', 8: 'lg:col-span-8', 12: 'lg:col-span-12' };

export function DashboardView() {
  const { user } = useAuth();
  const [f, setF] = useState({ type: 'GROSIR' as ReportType, days: '30', spg: '', spv: '', prov: '', kab: '', kec: '', tipe: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['dash', f], queryFn: () => api<Dash>('/dashboard', { query: f }) });
  const spvs = useQuery({ queryKey: ['users', 'SPV'], queryFn: () => api<AuthUser[]>('/users', { query: { role: 'SPV' } }), enabled: user?.role === 'ADMIN' });
  const wil = useWilayah();
  const provs = [...new Map((wil.data ?? []).map((k) => [k.provKode, k.provinsi])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const kabs = (wil.data ?? []).filter((k) => !f.prov || k.provKode === f.prov);
  const kecs = f.kab ? wil.data?.find((k) => k.kode === f.kab)?.kecamatan ?? [] : [];
  const d = q.data; const locOn = f.prov || f.kab || f.kec || f.tipe;
  const onCell = (c: Cell) => { if (typeof c === 'object' && c.geo) { if (f.kab) set({ kec: c.geo }); else set({ kab: c.geo, prov: c.geo.slice(0, 2) }); } else if (typeof c === 'object' && c.tipe) set({ tipe: c.tipe }); };
  return <>
    <PageHeader title={d?.title ?? 'Dashboard'} description={d ? `${d.reports} laporan disetujui${d.coverage ? ` · wilayah Anda: ${d.coverage.join(', ') || 'belum ditetapkan'}` : ''}${d.truncated ? ' · data terpotong, persempit periode' : ''}` : 'Memuat…'}
      actions={<Button variant="secondary" size="sm" onClick={() => download('/dashboard/export', f).catch((e) => alert((e as Error).message))}><Download className="h-4 w-4" />Unduh CSV</Button>} />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg bg-slate-200/60 p-1" role="group" aria-label="Kategori">{TYPES.map((t) => <button key={t} aria-pressed={f.type === t} onClick={() => set({ type: t, spg: '', tipe: '' })}
        className={cn('h-8 rounded-md px-3 text-sm', f.type === t ? 'bg-white font-semibold shadow-sm' : 'text-ink-secondary')}>{TYPE_LABEL[t]}</button>)}</div>
      <select aria-label="Periode" className={selectCls} value={f.days} onChange={(e) => set({ days: e.target.value })}>{['7', '30', '90'].map((x) => <option key={x} value={x}>{x} hari</option>)}</select>
      {user?.role === 'ADMIN' && <select aria-label="Wilayah supervisor" className={selectCls} value={f.spv} onChange={(e) => set({ spv: e.target.value })}>
        <option value="">Semua supervisor</option><option value="_none">Tanpa SPV</option>{(spvs.data ?? []).map((s) => <option key={s.id} value={s.id}>Wilayah {s.name}</option>)}</select>}
      <select aria-label="SPG" className={selectCls} value={f.spg} onChange={(e) => set({ spg: e.target.value })}><option value="">Semua SPG</option>{(d?.spgOptions ?? []).map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Provinsi" className={selectCls} value={f.prov} onChange={(e) => set({ prov: e.target.value, kab: '', kec: '' })}><option value="">Semua provinsi</option>{provs.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <select aria-label="Kabupaten/kota" className={selectCls} value={f.kab} onChange={(e) => set({ kab: e.target.value, kec: '', prov: e.target.value ? e.target.value.slice(0, 2) : f.prov })}><option value="">Semua kab/kota</option>{kabs.map((k) => <option key={k.kode} value={k.kode}>{shortKab(k.nama)}</option>)}</select>
      <select aria-label="Kecamatan" className={selectCls} value={f.kec} disabled={!f.kab} onChange={(e) => set({ kec: e.target.value })}><option value="">{f.kab ? 'Semua kecamatan' : 'Kecamatan (pilih kab/kota)'}</option>{kecs.map((c) => <option key={c.kode} value={c.kode}>{c.nama}</option>)}</select>
      {!!d?.tipeOptions.length && <select aria-label="Tipe toko" className={selectCls} value={f.tipe} onChange={(e) => set({ tipe: e.target.value })}><option value="">{f.type === 'GROSIR' ? 'Semua pembeli' : 'Semua tipe outlet'}</option>{d.tipeOptions.map((t) => <option key={t}>{t}</option>)}</select>}
      {locOn && <Button variant="ghost" size="sm" onClick={() => set({ prov: '', kab: '', kec: '', tipe: '' })}>Hapus filter wilayah</Button>}
    </div>
    {q.error && <ErrorBox error={q.error instanceof ApiError ? q.error : new Error('Gagal memuat dashboard')} />}
    {q.isLoading && <Skeleton className="h-64" />}
    {d && !d.tiles.length && <div className="mb-4 rounded-lg border border-border bg-white p-8 text-center text-sm text-ink-muted">Belum ada laporan yang disetujui untuk filter ini. Setujui laporan di <Link className="text-primary underline" href="/review">Persetujuan</Link>{user?.role === 'ADMIN' && <>, atau muat data contoh di <Link className="text-primary underline" href="/settings">Pengaturan</Link></>}.</div>}
    {d && !!d.tiles.length && <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">{d.tiles.map((t) =>
      <div key={t.k} className="bg-white px-4 py-3"><div className="text-xs text-ink-secondary">{t.k}</div><div className="num mt-1 text-2xl font-semibold">{t.v}</div><div className="text-xs text-ink-muted">{t.d}</div></div>)}</div>}
    {d && <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">{d.panels.map((p, i) => <section key={i} className={cn('min-w-0 rounded-lg border border-border bg-white', SPAN[p.span] ?? 'lg:col-span-4')}>
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{p.title}</h2>{p.sub && <p className="text-xs text-ink-muted">{p.sub}</p>}</div>
      <div className="p-4">{p.kind === 'bars' ? <Bars p={p} /> : p.kind === 'gallery' ? <Gallery p={p} /> : <Table p={p} onCell={onCell} />}</div></section>)}</div>}
  </>;
}

function Bars({ p }: { p: Panel }) {
  const rows = (p.rows ?? []) as { label: string; n: number; tone?: string }[];
  const max = Math.max(1, ...rows.map((r) => r.n)); const total = rows.reduce((a, r) => a + r.n, 0);
  if (!total) return <p className="py-4 text-center text-sm text-ink-muted">Belum ada data</p>;
  return <div className="grid gap-2">{rows.slice(0, 12).map((r) => <div key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-2 text-[13px]">
    <span className="truncate text-ink-secondary" title={r.label}>{r.label}</span>
    <span className="h-2.5 overflow-hidden rounded bg-slate-100"><i className={cn('block h-full rounded', r.tone === 'tt' ? 'bg-tt' : r.tone === 'comp' ? 'bg-comp' : 'bg-primary')} style={{ width: `${(r.n / max) * 100}%` }} /></span>
    <span className="num text-right">{fmtNum(r.n)}{p.pct && <span className="ml-1 text-2xs text-ink-muted">{((r.n / total) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>}</span></div>)}</div>;
}
function Table({ p, onCell }: { p: Panel; onCell: (c: Cell) => void }) {
  const rows = (p.rows ?? []) as Cell[][];
  return <div className="-m-4 overflow-x-auto"><table className="w-full text-[13px]"><thead><tr>{p.columns!.map((c) => <th key={c.label} className={cn('whitespace-nowrap bg-surface px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted', c.num ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={cn('px-3 py-2', p.columns![j]?.num && 'num text-right')}>
      {typeof c === 'object' && c ? <button className="text-left text-primary underline-offset-2 hover:underline" onClick={() => onCell(c)}>{c.text}</button> : typeof c === 'number' ? fmtNum(c) : c}</td>)}</tr>)}
      {!rows.length && <tr><td colSpan={p.columns!.length} className="py-6 text-center text-ink-muted">{p.empty ?? 'Belum ada data'}</td></tr>}</tbody></table></div>;
}
function Gallery({ p }: { p: Panel }) {
  if (!p.items?.length) return <p className="py-4 text-center text-sm text-ink-muted">Belum ada foto</p>;
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">{p.items.map((it, i) => <figure key={i} className="grid gap-1 text-2xs text-ink-muted">
    <Photo value={it.photo} alt={it.cap} className="aspect-square h-auto w-full" /><figcaption>{it.cap}</figcaption></figure>)}</div>;
}

'use client';
/** Log aktivitas laporan: siapa membuat, menyimpan, mengirim, menarik, menyetujui, menolak, menghapus isian/laporan.
 *  Admin melihat semua; supervisor hanya laporan di wilayahnya. Sumbernya tabel riwayat yang tidak bisa diubah. */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { type ReportType, TYPE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassContainer } from '@/components/ui/glass-container';
import { GlassDrawer } from '@/components/ui/glass-drawer';
import { GlassInput } from '@/components/ui/glass-input';
import { GlassTable, Pagination, usePaged } from '@/components/ui/glass-table';
import { PageContainer, PageHeader } from '@/components/layout/page-container';
import { Detail, LOG_LABEL } from './review';

interface Act { at: string; action: string; by?: string; note?: string; reportId: string; type: ReportType; title: string; spg?: string; status: string }
const KINDS: [string, string][] = [['', 'Semua'], ['hapus', 'Penghapusan'], ['isian', 'Isian dihapus'], ['putus', 'Disetujui / ditolak'], ['kirim', 'Dikirim / ditarik'], ['simpan', 'Dibuat / disimpan']];
const RED = new Set(['ISIAN_DIHAPUS', 'DIHAPUS', 'DITOLAK']);

export function ActivityView() {
  const { user } = useAuth();
  const [kind, setKind] = useState(''); const [text, setText] = useState(''); const [q, setQ] = useState(''); const [open, setOpen] = useState<Act | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(text), 350); return () => clearTimeout(t); }, [text]);
  const acts = useQuery({ queryKey: ['activity', kind, q], queryFn: () => api<Act[]>('/review/activity', { query: { kind, q } }) });
  const pg = usePaged(acts.data ?? [], 30);
  return <PageContainer preset="data">
    <PageHeader eyebrow="Riwayat" title="Log aktivitas"
      description={user?.role === 'ADMIN' ? 'Semua kejadian pada laporan SPG: dibuat, disimpan, dikirim, ditarik, disetujui, ditolak, isian dihapus. Tidak bisa diubah atau dihapus.'
        : 'Kejadian pada laporan SPG di wilayah Anda. Tidak bisa diubah atau dihapus.'} />
    <GlassContainer className="enter mb-4 grid gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Jenis aktivitas">{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} data-kind={k || 'semua'}
        className={cn('min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors', kind === k ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white/70 hover:bg-white')}
        onClick={() => setKind(k)}>{l}</button>)}</div>
      <GlassInput placeholder="Cari nama SPG, supervisor, atau alasan…" aria-label="Cari" value={text} onChange={(e) => setText(e.target.value)} className="max-w-md" />
      <p className="text-xs text-ink-muted">Isian yang dihapus juga ada di file Excel (lembar <b>Log isian dihapus</b>).
        {user?.role === 'ADMIN' && <> Perubahan akun, wilayah, dan pengaturan ada di <Link href="/audit" className="font-semibold underline underline-offset-2">Log audit</Link>.</>}</p>
    </GlassContainer>
    {acts.isLoading ? <Skeleton className="h-64" /> : !acts.data?.length ? <GlassContainer><EmptyState title="Belum ada aktivitas" hint="Coba ganti jenis aktivitas atau kata pencarian." /></GlassContainer> :
    <GlassContainer className="enter overflow-hidden"><GlassTable plain><thead><tr>{['Waktu', 'Aktivitas', 'Oleh', 'SPG', 'Laporan', 'Keterangan', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody data-activity>{pg.slice.map((a, i) => <tr key={i}>
        <td className="whitespace-nowrap">{fmtDateTime(a.at)}</td>
        <td className={cn('whitespace-nowrap font-medium', RED.has(a.action) && 'text-critical-text')}>{LOG_LABEL[a.action] ?? a.action}</td>
        <td>{a.by ?? '–'}</td><td className="font-medium">{a.spg ?? '–'}</td>
        <td><div className="max-w-[16rem] truncate">{a.title}</div><div className="text-2xs text-ink-muted">{TYPE_LABEL[a.type]}</div></td>
        <td className="max-w-sm text-ink-secondary">{a.note ?? ''}</td>
        <td><Button size="sm" variant="secondary" onClick={() => setOpen(a)}>Detail</Button></td></tr>)}</tbody></GlassTable>
      <Pagination {...pg} /></GlassContainer>}
    <GlassDrawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `${open.title} · ${TYPE_LABEL[open.type]}` : ''} description={open?.spg}>
      {open && <Detail id={open.reportId} />}
    </GlassDrawer>
  </PageContainer>;
}

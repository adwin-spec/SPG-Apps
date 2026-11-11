'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MapPin, RotateCcw, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, fmtTime } from '@/lib/format';
import { type AuthUser, type ReportType, TYPE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBox, Skeleton } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassContainer } from '@/components/ui/glass-container';
import { GlassDrawer } from '@/components/ui/glass-drawer';
import { Field, GlassInput, GlassTextarea } from '@/components/ui/glass-input';
import { GlassModal } from '@/components/ui/glass-modal';
import { GlassTable, Pagination, usePaged } from '@/components/ui/glass-table';
import { PageContainer, PageHeader } from '@/components/layout/page-container';
import { useToast } from '@/components/ui/toast';
import { Photo } from '@/components/photo';
import { type FormsPayload, type Gps, kecFull, lab, labelOfStatus, mapsLink, val } from '@/features/field/engine';
import { selectCls } from './hooks';

interface Row { id: string; type: ReportType; status: string; title: string; loc: any; startedAt: string; endedAt?: string; spg: { name: string }; entryCount: number; packs: number;
  revision: number; reviewNote?: string; reviewedBy?: string; spvNames: string[]; flags: string[]; canDecide: boolean; gps?: Gps | null;
  deletedAt?: string; deletedBy?: string; deleteReason?: string; prevStatus?: string }
const TONE: Record<string, 'good' | 'warn' | 'critical' | 'neutral'> = { APPROVED: 'good', SUBMITTED: 'warn', REJECTED: 'critical', REVISION: 'neutral', DRAFT: 'neutral', DELETED: 'critical' };

export function ReviewView() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [status, setStatus] = useState('SUBMITTED'); const [scope, setScope] = useState('mine'); const [spv, setSpv] = useState('');
  const [open, setOpen] = useState<Row | null>(null); const [rejecting, setRejecting] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['review', status, scope, spv], queryFn: () => api<Row[]>('/review', { query: { status, scope, spv } }) });
  const spvs = useQuery({ queryKey: ['users', 'SPV'], queryFn: () => api<AuthUser[]>('/users', { query: { role: 'SPV' } }), enabled: user?.role === 'ADMIN' });
  const pg = usePaged(q.data ?? [], 25);
  const admin = user?.role === 'ADMIN';
  // Hapus (admin): satu laporan dari laci detail, atau beberapa sekaligus dari kotak centang
  const [picked, setPicked] = useState<Set<string>>(new Set()); const [delIds, setDelIds] = useState<string[] | null>(null); const [delReason, setDelReason] = useState('');
  useEffect(() => setPicked(new Set()), [status, scope, spv]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['review'] }); qc.invalidateQueries({ queryKey: ['dash'] }); };
  const doDelete = async () => {
    if (!delIds || delReason.trim().length < 5) return toast('error', 'Tulis alasan penghapusan (minimal 5 huruf)');
    setBusy(true); let done = 0;
    try { for (const id of delIds) { await api(`/review/${id}/delete`, { method: 'POST', body: { reason: delReason } }); done++; } toast('success', `${done} laporan dihapus. Bisa dipulihkan dari tab "Dihapus".`); }
    catch (e) { toast('error', `${done} terhapus, lalu gagal: ${e instanceof ApiError ? e.message : 'coba lagi'}`); }
    finally { setBusy(false); setDelIds(null); setDelReason(''); setPicked(new Set()); setOpen(null); refresh(); }
  };
  const restore = async (id: string) => {
    setBusy(true);
    try { const r = await api<Row>(`/review/${id}/restore`, { method: 'POST' }); toast('success', r.status === 'SUBMITTED' ? 'Dipulihkan – masuk antrean persetujuan lagi' : 'Dipulihkan – dikembalikan ke SPG'); setOpen(null); refresh(); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const canPick = admin && status !== 'DELETED';
  const show = (r: Row, reject = false) => { setOpen(r); setRejecting(reject); setNote(''); };
  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && note.trim().length < 5) return toast('error', 'Tulis alasan penolakan agar SPG tahu apa yang harus diperbaiki');
    setBusy(true);
    try { await api(`/review/${id}/${action}`, { method: 'POST', body: action === 'reject' ? { note } : undefined });
      toast('success', action === 'approve' ? 'Disetujui – masuk ke dashboard' : 'Ditolak – dikembalikan ke SPG'); setOpen(null); setNote(''); qc.invalidateQueries({ queryKey: ['review'] }); qc.invalidateQueries({ queryKey: ['dash'] }); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } finally { setBusy(false); }
  };
  const seg = (items: [string, string][], cur: string, set: (v: string) => void, label: string) => <div className="inline-flex flex-wrap rounded-glass-sm bg-black/[.05] p-1" role="group" aria-label={label}>
    {items.map(([v, l]) => <button key={v} aria-pressed={cur === v} onClick={() => set(v)} className={cn('h-8 rounded-[8px] px-3 text-sm font-semibold transition-colors', cur === v ? 'bg-ink text-white shadow-sm' : 'text-ink-secondary hover:text-ink')}>{l}</button>)}</div>;
  return <PageContainer preset="review">
    <PageHeader eyebrow="Persetujuan" title="Laporan masuk" description={user?.role === 'SPV' ? `Anda supervisor untuk: ${user.coverage.map((c) => c.label).join(', ') || 'belum ada wilayah – hubungi admin pusat'}. Laporan masuk dashboard setelah disetujui.`
      : 'Laporan otomatis diarahkan ke supervisor yang memegang kecamatan lokasinya. Wilayah tanpa supervisor ditangani admin pusat.'} />
    <GlassContainer level="elevated" className="enter mb-5 flex flex-wrap items-center gap-2 !rounded-glass-md p-2.5">
      {user?.role === 'SPV' ? seg([['mine', 'Wilayah saya'], ['all', 'Semua (baca saja)']], scope, setScope, 'Cakupan')
        : <select aria-label="Wilayah supervisor" className={selectCls} value={spv} onChange={(e) => setSpv(e.target.value)}><option value="">Semua wilayah</option><option value="_none">Tanpa SPV (ditangani pusat)</option>
          {(spvs.data ?? []).map((s) => <option key={s.id} value={s.id}>Wilayah {s.name}</option>)}</select>}
      {seg([['SUBMITTED', 'Menunggu'], ['APPROVED', 'Disetujui'], ['REJECTED', 'Ditolak / diperbaiki'], ...(admin ? [['DRAFT', 'Sedang dikerjakan'], ['DELETED', 'Dihapus']] as [string, string][] : []), ['', 'Semua']], status, setStatus, 'Status')}
      {canPick && picked.size > 0 && <Button size="sm" variant="danger" className="ml-auto" onClick={() => { setDelIds([...picked]); setDelReason(''); }}><Trash2 className="h-4 w-4" />Hapus {picked.size} terpilih</Button>}
    </GlassContainer>
    {q.error && <ErrorBox error={q.error} />}
    {q.isLoading ? <Skeleton className="h-64" /> : !q.data?.length ? <GlassContainer><EmptyState title={status === 'SUBMITTED' ? 'Tidak ada laporan yang menunggu' : status === 'DELETED' ? 'Tidak ada laporan yang dihapus' : status === 'DRAFT' ? 'Tidak ada laporan yang sedang dikerjakan' : 'Tidak ada laporan'} hint="Laporan dari SPG di cakupan ini akan muncul di sini." /></GlassContainer> :
    <GlassContainer className="enter overflow-hidden"><GlassTable plain><thead><tr>
        {canPick && <th className="w-8"><input type="checkbox" aria-label="Pilih semua di halaman ini" checked={pg.slice.length > 0 && pg.slice.every((r) => picked.has(r.id))}
          onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...pg.slice.map((r) => r.id)]) : new Set([...picked].filter((id) => !pg.slice.some((r) => r.id === id))))} /></th>}
        {['Tanggal', 'SPG', 'Lokasi', 'Supervisor', 'Kontak', 'Bks TT', 'Pemeriksaan', 'Status', ''].map((h, i) => <th key={h || i} className={i === 4 || i === 5 ? 'r' : ''}>{h}</th>)}</tr></thead>
      <tbody>{pg.slice.map((r) => <tr key={r.id} aria-selected={open?.id === r.id || picked.has(r.id)}>
        {canPick && <td><input type="checkbox" aria-label={`Pilih laporan ${r.title}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>}
        <td>{fmtDate(r.startedAt)}<div className="text-2xs text-ink-muted">{fmtTime(r.startedAt)}–{fmtTime(r.endedAt)}</div></td>
        <td className="font-medium">{r.spg.name}<div className="text-2xs font-normal text-ink-muted">{TYPE_LABEL[r.type]}</div></td>
        <td>{r.title}<div className="text-2xs text-ink-muted">{kecFull(r.loc)}</div>{r.gps && <a className="mt-0.5 inline-flex items-center gap-1 text-2xs font-medium underline underline-offset-2" href={mapsLink(r.gps)} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" />GPS</a>}</td>
        <td>{[...new Set(r.spvNames)].join(', ') || 'Admin pusat (belum ada SPV)'}{r.reviewedBy && <div className="text-2xs text-ink-muted">diputus: {r.reviewedBy}</div>}</td>
        <td className="r">{r.entryCount}</td><td className="r">{fmtNum(r.packs)}</td>
        <td>{r.flags.length ? <div className="grid gap-1">{r.flags.map((f) => <Badge key={f} tone="warn" icon>{f}</Badge>)}</div> : <Badge tone="good" icon>Wajar</Badge>}</td>
        <td><Badge tone={TONE[r.status] ?? 'neutral'} icon>{labelOfStatus(r.status)}</Badge>{!!r.revision && <div className="mt-1 text-2xs text-ink-muted">Revisi ke-{r.revision}</div>}
          {r.reviewNote && ['REJECTED', 'REVISION'].includes(r.status) && <div className="text-2xs text-ink-muted">Alasan: {r.reviewNote}</div>}
          {r.status === 'DELETED' && <div className="mt-1 text-2xs text-ink-muted">oleh {r.deletedBy} · {fmtDate(r.deletedAt)}<br />Alasan: {r.deleteReason}</div>}</td>
        <td><div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => show(r)}>Detail</Button>
          {r.status === 'SUBMITTED' && (r.canDecide ? <><Button size="sm" disabled={busy} data-approve={r.id} onClick={() => decide(r.id, 'approve')}>Setujui</Button>
            <Button size="sm" variant="ghost" className="text-critical-text" onClick={() => show(r, true)}>Tolak</Button></> : <span className="text-2xs text-ink-muted">Wilayah SPV lain</span>)}
          {r.status === 'DELETED' && admin && <Button size="sm" variant="secondary" loading={busy} onClick={() => restore(r.id)}><RotateCcw className="h-3.5 w-3.5" />Pulihkan</Button>}</div></td></tr>)}</tbody></GlassTable>
      <Pagination {...pg} /></GlassContainer>}

    <GlassDrawer open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? `${open.title} · ${TYPE_LABEL[open.type]}` : ''}
      description={open ? `${open.spg.name} · ${fmtDate(open.startedAt)} · ${kecFull(open.loc)}` : undefined}
      footer={open && admin && !rejecting && open.status === 'DELETED' ? <Button loading={busy} onClick={() => restore(open.id)}><RotateCcw className="h-4 w-4" />Pulihkan laporan</Button>
        : open?.status === 'SUBMITTED' && open.canDecide ? (rejecting
        ? <div className="flex w-full flex-wrap gap-2"><GlassInput autoFocus className="min-w-[14rem] flex-1" placeholder="Alasan ditolak & apa yang harus diperbaiki SPG (wajib)" aria-label="Alasan penolakan" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="ghost" onClick={() => setRejecting(false)}>Batal</Button><Button variant="danger" loading={busy} onClick={() => decide(open.id, 'reject')}>Tolak &amp; kembalikan</Button></div>
        : <>{admin && <Button variant="ghost" className="mr-auto text-critical-text" onClick={() => { setDelIds([open.id]); setDelReason(''); }}><Trash2 className="h-4 w-4" />Hapus</Button>}
            <Button variant="secondary" className="text-critical-text" onClick={() => setRejecting(true)}>Tolak…</Button><Button loading={busy} onClick={() => decide(open.id, 'approve')}>Setujui laporan</Button></>)
        : open && admin ? <Button variant="ghost" className="text-critical-text" onClick={() => { setDelIds([open.id]); setDelReason(''); }}><Trash2 className="h-4 w-4" />Hapus laporan</Button> : undefined}>
      {open && <Detail id={open.id} />}
    </GlassDrawer>

    <GlassModal open={!!delIds} onOpenChange={(o) => !o && setDelIds(null)} size="sm" title={delIds && delIds.length > 1 ? `Hapus ${delIds.length} laporan?` : 'Hapus laporan ini?'}
      description="Laporan disembunyikan dari SPG, antrean, dan dashboard (termasuk angka yang sudah disetujui). Tidak dibuang permanen: bisa dipulihkan dari tab Dihapus."
      footer={<><Button variant="ghost" onClick={() => setDelIds(null)}>Batal</Button><Button variant="danger" loading={busy} disabled={delReason.trim().length < 5} onClick={doDelete}><Trash2 className="h-4 w-4" />Hapus</Button></>}>
      <Field label="Alasan penghapusan" htmlFor="del-reason" hint="Wajib, minimal 5 huruf. Tercatat di riwayat laporan & log audit."><GlassTextarea id="del-reason" autoFocus value={delReason} onChange={(e) => setDelReason(e.target.value)} placeholder="Misal: laporan ganda, data uji coba, salah input" /></Field>
    </GlassModal>
  </PageContainer>;
}

function Detail({ id }: { id: string }) {
  const d = useQuery({ queryKey: ['review', 'detail', id], queryFn: () => api<any>(`/review/${id}`) });
  const forms = useQuery({ queryKey: ['forms'], queryFn: () => api<FormsPayload>('/forms'), staleTime: 300_000 });
  if (!d.data || !forms.data) return <p className="text-sm text-ink-muted">Memuat…</p>;
  const r = d.data; const F = forms.data.forms[r.type as ReportType]; const variants = forms.data.settings.variants;
  const qs = F.entry.filter((x) => !['textarea'].includes(x.type));
  const show = (q: any, v: any) => {
    if (v == null || v === '') return '–';
    if (q.type === 'photo') return <Photo value={v} alt={q.label} className="h-12 w-12" />;
    if (q.type === 'kecamatan') return kecFull(v);
    if (q.type === 'variants') return variants.map((k) => `${k} ${v[k] ?? 0}`).join(', ');
    if (q.type === 'stok') return variants.map((k) => `${k}: ${v[k] === 'ADA' ? 'ada' : v[k] === 'KOSONG' ? 'kosong' : v[k] === 'TIDAK' ? 'tidak jual' : '–'}`).join(', ');
    if (q.type === 'confirm') return 'Ya';
    if (q.type === 'gps') return <a className="inline-flex items-center gap-1 font-medium underline underline-offset-2" href={mapsLink(v)} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" />{v.lat.toFixed(4)}, {v.lon.toFixed(4)}{v.acc != null ? ` ±${v.acc}m` : ''}</a>;
    if (q.type === 'number' && /harga/i.test(q.id)) return fmtIdr(v);
    if (q.type === 'single' && Array.isArray(q.options)) { const o = q.options.find((x: any) => val(x) === v); return o ? lab(o) : String(v); }
    if (q.type === 'single' && q.options?.map) { const o = Object.values(q.options.map).flat().find((x: any) => val(x as any) === v); return o ? lab(o as any) : String(v); }
    return String(v);
  };
  return <div className="grid gap-3 text-[13px]">
    {r.status === 'DELETED' && <div className="rounded-glass-sm bg-critical-soft px-3 py-2 text-critical-text"><b>Dihapus</b> oleh {r.deletedBy} · {fmtDateTime(r.deletedAt)} – {r.deleteReason}</div>}
    <dl className="glass-nested grid gap-x-6 gap-y-1.5 p-3 sm:grid-cols-2">{F.start.map((q) => <div key={q.id} className="flex gap-2"><dt className="shrink-0 text-ink-muted">{q.col ?? q.label}:</dt><dd className="min-w-0 font-medium">{show(q, r.data.header?.[q.id])}</dd></div>)}</dl>
    <div className="glass-nested overflow-x-auto"><table className="glass-table"><thead><tr><th>#</th>{qs.map((q) => <th key={q.id}>{q.col ?? q.label.replace(/\?$/, '').slice(0, 28)}</th>)}</tr></thead>
      <tbody>{r.data.entries.map((e: any, i: number) => <tr key={i}><td>{i + 1}</td>{qs.map((q) => <td key={q.id}>{show(q, e[q.id])}</td>)}</tr>)}</tbody></table></div>
    {F.sections.map((s) => { const x = r.data.sections?.[s.key]; return <div key={s.key}><b>{s.title}:</b> {x?.none ? 'tidak ada' : (x?.items ?? []).map((it: any) => Object.values(it).join(' · ')).join('; ') || '–'}</div>; })}
    {F.closing.map((q) => <div key={q.id}><b>{q.col ?? q.label}:</b> {q.type === 'brandcounts' ? (r.data.closing?.[q.id] ?? []).map((t: any) => `${t.merek} (${t.batang ?? '–'} btg)`).join(', ') || '–' : show(q, r.data.closing?.[q.id])}</div>)}
    <div><b>Riwayat:</b> {r.log.map((l: any) => `${l.action.replace(/_/g, ' ').toLowerCase()}${l.by ? ' oleh ' + l.by : ''} ${fmtDateTime(l.at)}${l.note ? ` (“${l.note}”)` : ''}`).join(' → ')}</div>
  </div>;
}

'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, fmtTime } from '@/lib/format';
import { type AuthUser, type ReportType, TYPE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorBox, PageHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Photo } from '@/components/photo';
import { type FormsPayload, kecFull, lab, labelOfStatus, val } from '@/features/field/engine';
import { selectCls } from './hooks';

interface Row { id: string; type: ReportType; status: string; title: string; loc: any; startedAt: string; endedAt?: string; spg: { name: string }; entryCount: number; packs: number;
  revision: number; reviewNote?: string; reviewedBy?: string; spvNames: string[]; flags: string[]; canDecide: boolean }
const TONE: Record<string, 'good' | 'warn' | 'critical' | 'neutral'> = { APPROVED: 'good', SUBMITTED: 'warn', REJECTED: 'critical', REVISION: 'neutral' };

export function ReviewView() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [status, setStatus] = useState('SUBMITTED'); const [scope, setScope] = useState('mine'); const [spv, setSpv] = useState('');
  const [open, setOpen] = useState<string | null>(null); const [rej, setRej] = useState<string | null>(null); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['review', status, scope, spv], queryFn: () => api<Row[]>('/review', { query: { status, scope, spv } }) });
  const spvs = useQuery({ queryKey: ['users', 'SPV'], queryFn: () => api<AuthUser[]>('/users', { query: { role: 'SPV' } }), enabled: user?.role === 'ADMIN' });
  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && note.trim().length < 5) return toast('error', 'Tulis alasan penolakan agar SPG tahu apa yang harus diperbaiki');
    setBusy(true);
    try { await api(`/review/${id}/${action}`, { method: 'POST', body: action === 'reject' ? { note } : undefined });
      toast('success', action === 'approve' ? 'Disetujui – masuk ke dashboard' : 'Ditolak – dikembalikan ke SPG'); setRej(null); setNote(''); qc.invalidateQueries({ queryKey: ['review'] }); qc.invalidateQueries({ queryKey: ['dash'] }); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } finally { setBusy(false); }
  };
  const seg = (items: [string, string][], cur: string, set: (v: string) => void, label: string) => <div className="inline-flex flex-wrap rounded-lg bg-slate-200/60 p-1" role="group" aria-label={label}>
    {items.map(([v, l]) => <button key={v} aria-pressed={cur === v} onClick={() => set(v)} className={cn('h-8 rounded-md px-3 text-sm', cur === v ? 'bg-white font-semibold shadow-sm' : 'text-ink-secondary')}>{l}</button>)}</div>;
  return <>
    <PageHeader title="Persetujuan laporan" description={user?.role === 'SPV' ? `Anda supervisor untuk: ${user.coverage.map((c) => c.label).join(', ') || 'belum ada wilayah – hubungi admin pusat'}. Laporan masuk dashboard setelah disetujui.`
      : 'Laporan otomatis diarahkan ke supervisor yang memegang kecamatan lokasinya. Wilayah tanpa supervisor ditangani admin pusat.'} />
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {user?.role === 'SPV' ? seg([['mine', 'Wilayah saya'], ['all', 'Semua (baca saja)']], scope, setScope, 'Cakupan')
        : <select aria-label="Wilayah supervisor" className={selectCls} value={spv} onChange={(e) => setSpv(e.target.value)}><option value="">Semua wilayah</option><option value="_none">Tanpa SPV (ditangani pusat)</option>
          {(spvs.data ?? []).map((s) => <option key={s.id} value={s.id}>Wilayah {s.name}</option>)}</select>}
      {seg([['SUBMITTED', 'Menunggu'], ['APPROVED', 'Disetujui'], ['REJECTED', 'Ditolak / diperbaiki'], ['', 'Semua']], status, setStatus, 'Status')}
    </div>
    {q.error && <ErrorBox error={q.error} />}
    <div className="overflow-x-auto rounded-lg border border-border bg-white"><table className="w-full text-[13px]"><thead><tr className="bg-surface text-left text-2xs uppercase tracking-wide text-ink-muted">
      {['Tanggal', 'SPG', 'Lokasi', 'Supervisor', 'Kontak', 'Bks TT', 'Pemeriksaan', 'Status', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{(q.data ?? []).map((r) => <Fragment key={r.id}><tr className="border-t border-border align-top">
        <td className="px-3 py-2">{fmtDate(r.startedAt)}<div className="text-2xs text-ink-muted">{fmtTime(r.startedAt)}–{fmtTime(r.endedAt)}</div></td>
        <td className="px-3 py-2">{r.spg.name}<div className="text-2xs text-ink-muted">{TYPE_LABEL[r.type]}</div></td>
        <td className="px-3 py-2">{r.title}<div className="text-2xs text-ink-muted">{kecFull(r.loc)}</div></td>
        <td className="px-3 py-2">{r.spvNames.join(', ') || 'Admin pusat (belum ada SPV)'}{r.reviewedBy && <div className="text-2xs text-ink-muted">diputus: {r.reviewedBy}</div>}</td>
        <td className="num px-3 py-2 text-right">{r.entryCount}</td><td className="num px-3 py-2 text-right">{fmtNum(r.packs)}</td>
        <td className="px-3 py-2">{r.flags.length ? r.flags.map((f) => <div key={f}><Badge tone="warn" icon>{f}</Badge></div>) : <Badge tone="good" icon>Wajar</Badge>}</td>
        <td className="px-3 py-2"><Badge tone={TONE[r.status] ?? 'neutral'} icon>{labelOfStatus(r.status)}</Badge>{!!r.revision && <div className="text-2xs text-tt">Revisi ke-{r.revision}</div>}
          {r.reviewNote && ['REJECTED', 'REVISION'].includes(r.status) && <div className="text-2xs text-ink-muted">Alasan: {r.reviewNote}</div>}</td>
        <td className="px-3 py-2"><div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>Detail</Button>
          {r.status === 'SUBMITTED' && (r.canDecide ? <><Button size="sm" variant="success" disabled={busy} data-approve={r.id} onClick={() => decide(r.id, 'approve')}>Setujui</Button>
            <Button size="sm" variant="secondary" className="text-critical-text" onClick={() => { setRej(rej === r.id ? null : r.id); setNote(''); }}>Tolak</Button></> : <span className="text-2xs text-ink-muted">Wilayah SPV lain</span>)}</div></td></tr>
        {rej === r.id && <tr><td colSpan={9} className="px-3 pb-3"><div className="flex flex-wrap gap-2"><input autoFocus className="h-9 min-w-[16rem] flex-1 rounded-md border border-border px-2.5" placeholder="Alasan ditolak & apa yang harus diperbaiki SPG (wajib)" aria-label="Alasan penolakan" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="danger" disabled={busy} onClick={() => decide(r.id, 'reject')}>Tolak &amp; kembalikan ke SPG</Button></div></td></tr>}
        {open === r.id && <tr><td colSpan={9} className="bg-surface/60 px-3 py-3"><Detail id={r.id} /></td></tr>}</Fragment>)}
        {!q.isLoading && !q.data?.length && <tr><td colSpan={9} className="py-10 text-center text-ink-muted">{status === 'SUBMITTED' ? 'Tidak ada laporan yang menunggu di cakupan ini.' : 'Tidak ada laporan.'}</td></tr>}</tbody></table></div>
  </>;
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
    if (q.type === 'number' && /harga/i.test(q.id)) return fmtIdr(v);
    if (q.type === 'single' && Array.isArray(q.options)) { const o = q.options.find((x: any) => val(x) === v); return o ? lab(o) : String(v); }
    if (q.type === 'single' && q.options?.map) { const o = Object.values(q.options.map).flat().find((x: any) => val(x as any) === v); return o ? lab(o as any) : String(v); }
    return String(v);
  };
  return <div className="grid gap-3 text-[13px]">
    <div className="overflow-x-auto rounded-md border border-border bg-white"><table className="w-full"><thead><tr className="bg-surface text-left text-2xs uppercase text-ink-muted"><th className="px-2 py-1.5">#</th>{qs.map((q) => <th key={q.id} className="whitespace-nowrap px-2 py-1.5">{q.label.replace(/\?$/, '').slice(0, 28)}</th>)}</tr></thead>
      <tbody>{r.data.entries.map((e: any, i: number) => <tr key={i} className="border-t border-border align-top"><td className="px-2 py-1.5">{i + 1}</td>{qs.map((q) => <td key={q.id} className="px-2 py-1.5">{show(q, e[q.id])}</td>)}</tr>)}</tbody></table></div>
    {F.sections.map((s) => { const x = r.data.sections?.[s.key]; return <div key={s.key}><b>{s.title}:</b> {x?.none ? 'tidak ada' : (x?.items ?? []).map((it: any) => Object.values(it).join(' · ')).join('; ') || '–'}</div>; })}
    {F.closing.map((q) => <div key={q.id}><b>{q.label}:</b> {q.type === 'brandcounts' ? (r.data.closing?.[q.id] ?? []).map((t: any) => `${t.merek} (${t.batang ?? '–'} btg)`).join(', ') || '–' : show(q, r.data.closing?.[q.id])}</div>)}
    <div><b>Riwayat:</b> {r.log.map((l: any) => `${l.action.replace(/_/g, ' ').toLowerCase()}${l.by ? ' oleh ' + l.by : ''} ${fmtDateTime(l.at)}${l.note ? ` (“${l.note}”)` : ''}`).join(' → ')}</div>
  </div>;
}

'use client';
/** Aplikasi HP SPG: pilih tugas → mulai laporan → isi pembeli/responden/outlet → kirim → (bila ditolak) perbaiki.
 *  Isian disimpan di HP lebih dulu, lalu dikirim ke server; bila sinyal putus, dikirim otomatis saat online lagi. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtNum, fmtTime } from '@/lib/format';
import { type Kec, type ReportType, TYPE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Photo } from '@/components/photo';
import { type Answers, type FormDef, type FormsPayload, type KecIndex, indexKec, kecFull, labelOfStatus, sumVariants, titleCase, validate } from './engine';
import { Questions, type QCtx } from './questions';
import { PlusLoader, PlusMark } from '@/components/branding/plus-mark';
import { TypographyBackground } from '@/components/branding/typography-background';

interface Report {
  id: string; type: ReportType; status: string; version?: number; header: Answers; entries: Answers[]; sections: Record<string, { none?: boolean; items: Answers[] }>; closing: Answers;
  startedAt?: string; revision?: number; reviewNote?: string | null; reviewedBy?: string | null; spvNames?: string[]; title?: string; date?: string; entryCount?: number; dirty?: boolean;
}
type Screen = { k: 'home' } | { k: 'entry'; idx: number | null } | { k: 'section'; key: string };
const OPEN = ['DRAFT', 'REVISION'];
const store = { get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/diblokir */ } } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
const fromServer = (r: any): Report => ({ ...r, header: r.data?.header ?? {}, entries: r.data?.entries ?? [], sections: r.data?.sections ?? {}, closing: r.data?.closing ?? {} });
const body = (r: Report) => ({ type: r.type, header: r.header, entries: r.entries, sections: r.sections, closing: r.closing, version: r.version });

export function FieldApp() {
  const { user, logout, offline } = useAuth(); const toast = useToast();
  const key = (k: string) => `tt_${k}_${user!.id}`;
  const [forms, setForms] = useState<FormsPayload | null>(() => store.get('tt_forms'));
  const [wil, setWil] = useState<KecIndex | null>(null);
  const [mine, setMine] = useState<Report[]>(() => store.get(key('mine')) ?? []);
  const [open, setOpenState] = useState<Report | null>(() => store.get(key('open')));
  const [screen, setScreen] = useState<Screen>({ k: 'home' });
  const [draft, setDraft] = useState<Answers>({}); const [errs, setErrs] = useState<Record<string, string>>({});
  const [tugas, setTugas] = useState<ReportType | ''>(user!.tugas.length === 1 ? user!.tugas[0] : '');
  const [busy, setBusy] = useState(false); const [online, setOnline] = useState(true);

  const setOpen = useCallback((r: Report | null) => { setOpenState(r); store.set(key('open'), r); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const [f, w, m] = await Promise.all([api<FormsPayload>('/forms'), store.get<any[]>('tt_wilayah') ?? api<any[]>('/wilayah'), api<any[]>('/reports/mine')]);
      setForms(f); store.set('tt_forms', f); store.set('tt_wilayah', w); setWil(indexKec(w));
      const list = m.map(fromServer); setMine(list); store.set(key('mine'), list);
      const srvOpen = list.find((r) => OPEN.includes(r.status));
      setOpenState((cur) => {
        const next = cur?.dirty && (!srvOpen || srvOpen.id === cur.id) ? cur : srvOpen ?? null; // perubahan offline di HP diutamakan
        store.set(key('open'), next); return next;
      });
      setOnline(true);
    } catch (e) { if (!(e instanceof ApiError)) setOnline(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const w = store.get<any[]>('tt_wilayah'); if (w) setWil(indexKec(w)); load(); }, [load]);

  /** Simpan ke HP lalu ke server. Gagal karena sinyal → ditandai belum terkirim dan dicoba lagi otomatis. */
  const persist = useCallback(async (r: Report) => {
    const local = { ...r, dirty: true }; setOpen(local);
    try {
      const s = fromServer(await api<any>(`/reports/${r.id}`, { method: 'PUT', body: body(r) }));
      setOpen({ ...local, version: s.version, status: s.status, spvNames: s.spvNames, startedAt: s.startedAt, dirty: false }); setOnline(true); return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) { toast('error', 'Isian ditolak server: ' + e.message); setOpen({ ...local, dirty: false }); return false; }
      if (e instanceof ApiError && e.status === 409) { toast('error', e.message); await load(); return false; }
      if (e instanceof ApiError) { toast('error', e.message); return false; }
      setOnline(false); return true; // tersimpan di HP
    }
  }, [load, setOpen, toast]);
  useEffect(() => {
    const retry = () => { const cur = store.get<Report>(key('open')); if (cur?.dirty) persist(cur); };
    window.addEventListener('online', retry); const t = setInterval(retry, 30_000);
    return () => { window.removeEventListener('online', retry); clearInterval(t); };
  }, [persist]); // eslint-disable-line react-hooks/exhaustive-deps

  const variants = forms?.settings.variants ?? [];
  const brands = useMemo(() => {
    const s = new Set<string>(); const all = [...mine, ...(open ? [open] : [])];
    all.forEach((r) => { r.entries.forEach((e) => [e.tier2, e.rokokBiasa, e.kompetitor].forEach((b) => b && s.add(titleCase(b))));
      Object.values(r.sections ?? {}).forEach((x) => x.items?.forEach((i) => i.merek && s.add(titleCase(i.merek)))); (r.closing?.terlaris ?? []).forEach((t: any) => t.merek && s.add(titleCase(t.merek))); });
    return [...s].sort();
  }, [mine, open]);
  const ctx: QCtx | null = forms && wil ? {
    variants, kec: wil, preferKab: open ? (open.header[forms.forms[open.type].location_field] as Kec | undefined)?.kabKode : undefined,
    suggest: (k) => (k === 'brands' ? brands : k === 'grosirs' ? [...new Set([...forms.settings.grosirs, ...mine.map((r) => r.header.grosir).filter(Boolean)])].sort()
      : [...new Set([...mine, ...(open ? [open] : [])].flatMap((r) => r.entries.map((e) => e.namaOutlet)).filter(Boolean))].sort()),
    stamp: () => `${forms.settings.brand} · ${user!.name} · ${fmtDate(new Date())} ${fmtTime(new Date())} WIB`,
    spvFor: (k) => [...new Set(forms.supervisors.filter((s) => s.cover.some((c) => (c.level === 'KAB' ? c.kode === k.kabKode : c.kode === k.kode))).map((s) => s.name))].join(', ') || 'Admin pusat',
  } : null;

  const head = <header className="glass-dark sticky top-2 z-20 mx-2 mt-2 flex items-center gap-3 !rounded-glass-md px-3 py-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white"><PlusMark className="h-5 w-5" /></span>
    <div className="mr-auto min-w-0 leading-tight"><div className="truncate text-sm font-semibold">{user!.name}</div><div className="text-2xs text-white/60">SPG {user!.tugas.map((t) => TYPE_LABEL[t]).join(' + ')} · {fmtDate(new Date())}</div></div>
    {(!online || offline || open?.dirty) && <span className="flex items-center gap-1 rounded-full bg-warn px-2 py-0.5 text-2xs font-semibold text-ink"><WifiOff className="h-3 w-3" />{open?.dirty ? 'Belum terkirim' : 'Offline'}</span>}
    <button onClick={load} className="rounded-full p-2 hover:bg-white/10" aria-label="Muat ulang"><RefreshCw className="h-4 w-4" /></button>
    <button onClick={logout} className="rounded-full p-2 hover:bg-white/10" aria-label="Keluar"><LogOut className="h-4 w-4" /></button>
  </header>;
  if (!forms || !ctx) return <>{head}<div className="p-10">{online ? <PlusLoader label="Memuat form…" /> : <p className="text-center text-sm text-ink-muted">Butuh sinyal untuk membuka aplikasi pertama kali.</p>}</div></>;
  if (!user!.tugas.length) return <>{head}<p className="p-6 text-center text-sm text-ink-muted">Akun Anda belum diberi tugas. Hubungi admin pusat.</p></>;

  const F: FormDef | null = open ? forms.forms[open.type] : null;
  const btn = 'h-12 w-full rounded-glass-sm text-base font-semibold transition-[background-color,transform] duration-200 active:scale-[.99] disabled:opacity-50';
  let content: React.ReactNode;

  if (open && F && screen.k === 'entry') {
    const save = async () => {
      const e = validate(F.entry, draft, variants); setErrs(e);
      if (Object.keys(e).length) { toast('error', 'Lengkapi isian yang ditandai'); document.querySelector(`[data-qid="${Object.keys(e)[0]}"]`)?.scrollIntoView({ block: 'center' }); return; }
      const entry: Answers = { ...draft, at: draft.at ?? new Date().toISOString() };
      F.entry.forEach((q) => { if (q.titlecase && typeof entry[q.id] === 'string') entry[q.id] = titleCase(entry[q.id]); }); // sama seperti server
      const entries = [...open.entries]; if (screen.idx == null) entries.push(entry); else entries[screen.idx] = entry;
      setBusy(true); const ok = await persist({ ...open, entries }); setBusy(false);
      if (ok) { setScreen({ k: 'home' }); setDraft({}); toast('success', 'Tersimpan'); scrollTo(0, 0); }
    };
    content = <>
      <Card title={`${screen.idx == null ? 'Tambah' : 'Ubah'} ${F.entry_word}`} sub={F.entry_hint}><Questions qs={F.entry} value={draft} onChange={(a) => { setDraft(a); setErrs({}); }} errors={errs} ctx={ctx} idPrefix="entry" /></Card>
      <Sticky><button className={cn(btn, 'bg-ink text-white shadow-[0_8px_20px_rgba(0,0,0,.2)] hover:bg-ink-deep')} disabled={busy} onClick={save}>Simpan</button><button className="h-10 text-sm" onClick={() => { setScreen({ k: 'home' }); setDraft({}); }}>Batal</button></Sticky></>;
  } else if (open && F && screen.k === 'section') {
    const sec = F.sections.find((s) => s.key === screen.key)!;
    const save = async () => {
      const e = validate(sec.questions, draft, variants); setErrs(e); if (Object.keys(e).length) return toast('error', 'Lengkapi isian yang ditandai');
      const cur = open.sections[sec.key] ?? { items: [] };
      if (await persist({ ...open, sections: { ...open.sections, [sec.key]: { none: false, items: [...(cur.items ?? []), draft] } } })) { setScreen({ k: 'home' }); setDraft({}); }
    };
    content = <><Card title={sec.title}><Questions qs={sec.questions} value={draft} onChange={(a) => { setDraft(a); setErrs({}); }} errors={errs} ctx={ctx} idPrefix={sec.key} /></Card>
      <Sticky><button className={cn(btn, 'bg-ink text-white shadow-[0_8px_20px_rgba(0,0,0,.2)] hover:bg-ink-deep')} onClick={save}>Simpan</button><button className="h-10 text-sm" onClick={() => setScreen({ k: 'home' })}>Batal</button></Sticky></>;
  } else if (open && F) {
    const packs = open.entries.reduce((a, e) => a + sumVariants(e.beli), 0);
    const submit = async () => {
      const miss: string[] = [];
      if (!open.entries.length) miss.push(`minimal 1 ${F.entry_word}`);
      F.sections.forEach((s) => { const x = open.sections[s.key]; if (!x?.items?.length && !x?.none) miss.push(`${s.title.split('·')[0].trim()} (isi atau centang "tidak ada")`); });
      const e = validate(F.closing, open.closing, variants); setErrs(e); if (Object.keys(e).length) miss.push('isian penutup');
      if (miss.length) return toast('error', 'Belum lengkap: ' + miss.join(', '));
      setBusy(true);
      try {
        if (open.dirty && !(await persist(open))) return;
        await api(`/reports/${open.id}`, { method: 'PUT', body: body(open) });
        await api(`/reports/${open.id}/submit`, { method: 'POST' });
        toast('success', open.status === 'REVISION' ? 'Revisi terkirim – menunggu persetujuan ulang' : 'Laporan terkirim – menunggu persetujuan supervisor');
        setOpen(null); setTugas(user!.tugas.length === 1 ? user!.tugas[0] : ''); await load(); scrollTo(0, 0);
      } catch (er) { toast('error', er instanceof ApiError ? er.message : 'Kirim laporan butuh sinyal. Isian tetap tersimpan di HP.'); }
      finally { setBusy(false); }
    };
    content = <>
      {open.status === 'REVISION' && <div className="rounded-r-md border-l-4 border-critical bg-critical-soft px-3 py-2 text-sm"><b>Revisi</b> – alasan ditolak{open.reviewedBy ? ` oleh ${open.reviewedBy}` : ''}: {open.reviewNote}<div className="text-xs text-ink-muted">Perbaiki isian yang diminta, lalu tekan Kirim ulang.</div></div>}
      <Card title={reportTitle(open, F)} sub={`${kecFull(open.header[F.location_field])} · mulai ${fmtTime(open.startedAt)}`} badge={`${fmtNum(packs)} bks TT ${open.type === 'REGULER' ? 'diorder' : 'terjual'}`}>
        <div className="text-xs text-ink-secondary">Disetujui oleh: <b>{open.spvNames?.length ? [...new Set(open.spvNames)].join(', ') : ctx.spvFor!(open.header[F.location_field])}</b></div>
        <div className="mt-2 divide-y divide-border">{open.entries.map((e, i) => <div key={i} className="flex items-center gap-2 py-2">
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{entryTitle(open.type, e, i)}</div><div className="truncate text-xs text-ink-muted">{entrySub(open.type, e, forms)}</div></div>
          {(e.foto || e.fotoDisplay) && <Photo value={e.foto || e.fotoDisplay} alt="Foto" className="h-10 w-10" />}
          <button className="rounded-md px-2 py-1 text-sm font-semibold underline decoration-ink/30 decoration-2 underline-offset-4" onClick={() => { setDraft(structuredClone(e)); setErrs({}); setScreen({ k: 'entry', idx: i }); scrollTo(0, 0); }}>Ubah</button>
          <button className="rounded-md px-2 py-1 text-sm text-critical-text" onClick={() => persist({ ...open, entries: open.entries.filter((_, j) => j !== i) })} aria-label={`Hapus ${entryTitle(open.type, e, i)}`}>Hapus</button></div>)}</div>
        {!open.entries.length && <p className="py-2 text-sm text-ink-muted">Belum ada {F.entry_word}.</p>}
        <button className={cn(btn, 'mt-3 border border-line-strong bg-white/80 text-ink hover:bg-white')} onClick={() => { setDraft({}); setErrs({}); setScreen({ k: 'entry', idx: null }); scrollTo(0, 0); }}>+ Tambah {F.entry_word}</button>
      </Card>
      {F.sections.map((s) => { const x = open.sections[s.key] ?? { items: [] }; return <Card key={s.key} title={s.title}>
        {(x.items ?? []).map((it, i) => <div key={i} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-sm"><span>{Object.values(it).filter((v) => typeof v !== 'object').join(' · ')}</span>
          <button className="text-critical-text" onClick={() => persist({ ...open, sections: { ...open.sections, [s.key]: { none: false, items: x.items.filter((_, j) => j !== i) } } })}>Hapus</button></div>)}
        {!x.items?.length && <label className="relative mt-1 inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line-strong px-3.5 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white">
          <input type="checkbox" className="absolute opacity-0" data-none={s.key} checked={!!x.none} onChange={(e) => persist({ ...open, sections: { ...open.sections, [s.key]: { none: e.target.checked, items: [] } } })} />{s.none_label}</label>}
        {!x.none && <button className="mt-2 h-10 rounded-glass-sm border border-line-strong bg-white/70 px-3 text-sm font-semibold" onClick={() => { setDraft({}); setErrs({}); setScreen({ k: 'section', key: s.key }); scrollTo(0, 0); }}>+ Tambah</button>}
      </Card>; })}
      <Card title={open.type === 'REGULER' ? 'Penutup rute' : 'Penutup laporan'}>
        <Questions qs={F.closing} value={open.closing} onChange={(a) => { setOpen({ ...open, closing: a, dirty: true }); setErrs({}); }} errors={errs} ctx={ctx} idPrefix="closing" />
      </Card>
      <Sticky><button className={cn(btn, 'bg-ink text-white shadow-[0_8px_20px_rgba(0,0,0,.2)] hover:bg-ink-deep')} disabled={busy} onClick={submit}>{open.status === 'REVISION' ? 'Kirim ulang' : 'Kirim laporan'}</button>
        <button className="h-10 text-sm" disabled={busy} onClick={async () => { if (await persist(open)) toast('success', online ? 'Disimpan' : 'Disimpan di HP'); }}>Simpan sementara</button></Sticky></>;
  } else {
    const rejected = mine.filter((r) => r.status === 'REJECTED'); const done = mine.filter((r) => !OPEN.includes(r.status) && r.status !== 'REJECTED').slice(0, 8);
    const SF = tugas ? forms.forms[tugas] : null;
    const start = async () => {
      if (!SF || !tugas) return;
      const e = validate(SF.start, draft, variants); setErrs(e); if (Object.keys(e).length) return toast('error', 'Lengkapi isian yang ditandai');
      setBusy(true);
      const r: Report = { id: uuid(), type: tugas, status: 'DRAFT', header: draft, entries: [], sections: Object.fromEntries(SF.sections.map((s) => [s.key, { items: [] }])), closing: {}, startedAt: new Date().toISOString() };
      if (await persist(r)) { setDraft({}); await load(); }
      setBusy(false);
    };
    content = <>
      {!!rejected.length && <Card title={`Perlu diperbaiki (${rejected.length})`} sub="Ditolak · kerjakan ulang lalu kirim lagi">{rejected.map((r) => <div key={r.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
        <div className="min-w-0 flex-1"><b>{r.title}</b> <span className="text-xs text-ink-muted">{TYPE_LABEL[r.type]} · {fmtDate(r.startedAt)}{r.revision ? ` · revisi ke-${r.revision}` : ''}</span>
          <div className="mt-1 rounded-r-md border-l-4 border-critical bg-critical-soft px-2 py-1 text-sm"><b>Alasan{r.reviewedBy ? ` (${r.reviewedBy})` : ''}:</b> {r.reviewNote}</div></div>
        <button className="h-10 rounded-md border border-ink bg-ink px-3 text-sm font-bold text-white" data-rework={r.id} onClick={async () => {
          try { setOpen(fromServer(await api<any>(`/reports/${r.id}/rework`, { method: 'POST' }))); toast('success', 'Laporan dibuka kembali untuk diperbaiki'); await load(); } catch (e) { toast('error', (e as Error).message); } }}>Perbaiki</button></div>)}</Card>}
      {user!.tugas.length > 1 && <Card title="Tugas hari ini" sub={`Anda ditugaskan untuk ${user!.tugas.map((t) => TYPE_LABEL[t]).join(', ')}. Pilih satu untuk laporan ini.`}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tugas">{user!.tugas.map((t) => <label key={t} className="relative inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line-strong bg-white/70 px-3.5 font-medium has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-white ">
          <input type="radio" name="tugasPick" className="absolute opacity-0" checked={tugas === t} onChange={() => { setTugas(t); setDraft({}); setErrs({}); }} />{t === 'HORECA' ? 'Survei HORECA' : `SPG ${TYPE_LABEL[t]}`}</label>)}</div></Card>}
      {SF && <Card title={SF.start_title} sub="Jam mulai tercatat otomatis"><Questions qs={SF.start} value={draft} onChange={(a) => { setDraft(a); setErrs({}); }} errors={errs} ctx={ctx} idPrefix="start" />
        <button className={cn(btn, 'mt-3 bg-ink text-white shadow-[0_8px_20px_rgba(0,0,0,.2)] hover:bg-ink-deep')} disabled={busy} onClick={start}>Mulai</button></Card>}
      <Card title="Laporan terakhir">{done.length ? done.map((r) => <div key={r.id} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
        <div className="min-w-0"><div className="truncate font-medium">{r.title}</div><div className="text-xs text-ink-muted">{TYPE_LABEL[r.type]} · {fmtDate(r.startedAt)} · {r.entryCount} {forms.forms[r.type].entry_word}</div></div>
        <span className="shrink-0 text-xs font-semibold">{labelOfStatus(r.status)}</span></div>) : <p className="py-3 text-center text-sm text-ink-muted">Belum ada laporan.</p>}</Card></>;
  }
  return <div className="relative min-h-screen"><TypographyBackground preset="mobile" density="light" /><div className="relative z-10">{head}<main className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-3 p-3 pb-10">
    {open && F && screen.k === 'home' && <div className="enter px-1 pt-3"><div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.2em] text-ink-muted"><PlusMark className="h-2.5 w-2.5" />{TYPE_LABEL[open.type]}</div><h1 className="text-2xl font-bold tracking-tight">{F.title}</h1></div>}{content}</main></div></div>;
}

function Card({ title, sub, badge, children }: { title: string; sub?: string; badge?: string; children: React.ReactNode }) {
  return <section className="glass enter"><div className="flex items-start justify-between gap-2 px-4 pb-1 pt-3.5">
    <div className="min-w-0"><h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>{sub && <p className="text-xs text-ink-muted">{sub}</p>}</div>
    {badge && <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-2xs font-semibold text-white">{badge}</span>}</div><div className="px-4 pb-4 pt-2.5">{children}</div></section>;
}
function Sticky({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 grid gap-1 bg-gradient-to-t from-[var(--tt-soft-white)] from-70% to-transparent pt-4">{children}</div>;
}
function reportTitle(r: Report, F: FormDef) { return r.type === 'REGULER' ? r.header.rute || `Rute ${r.header.kecRute?.nama ?? ''}` : r.header[F.title_field] ?? '–'; }
function entryTitle(t: ReportType, e: Answers, i: number) { return t === 'GROSIR' ? e.namaToko || e.namaPembeli || 'Konsumen' : t === 'HORECA' ? `Responden ${i + 1}` : e.namaOutlet; }
function entrySub(t: ReportType, e: Answers, f: FormsPayload) {
  if (t === 'GROSIR') return `${e.jenis === 'RETAIL' ? e.tipeToko : 'Konsumen'} · ${e.kecamatan?.nama ?? ''} · ${sumVariants(e.beli)} bks TT`;
  if (t === 'HORECA') return `${e.usia} th · ${e.rokokBiasa} · ${sumVariants(e.beli)} bks TT · ${e.foto ? 'difoto' : 'tanpa foto'}`;
  const st = (f.options.statusOutlet as [string, string][]).find((o) => o[0] === e.statusOutlet)?.[1] ?? e.statusOutlet;
  return `${e.tipeOutlet} · ${e.kecOutlet?.nama ?? ''} · ${st} · order ${sumVariants(e.beli)} bks`;
}

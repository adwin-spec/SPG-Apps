'use client';
/** Aplikasi HP SPG: pilih tugas → mulai laporan → isi pembeli/responden/outlet → kirim → (bila ditolak) perbaiki.
 *  Isian disimpan di HP lebih dulu, lalu dikirim ke server; bila sinyal putus, dikirim otomatis saat online lagi. */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtNum, fmtTime } from '@/lib/format';
import { type Kec, type ReportType, TYPE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Photo } from '@/components/photo';
import { type Answers, type FormDef, type FormsPayload, type KecIndex, type Question, indexKec, kecFull, labelOfStatus, sumVariants, titleCase, validate } from './engine';
import { Questions, type QCtx } from './questions';
import { PlusLoader, PlusMark } from '@/components/branding/plus-mark';
import { TypographyBackground } from '@/components/branding/typography-background';

interface Report {
  id: string; type: ReportType; status: string; version?: number; header: Answers; entries: Answers[]; sections: Record<string, { none?: boolean; items: Answers[] }>; closing: Answers;
  startedAt?: string; updatedAt?: string; submittedAt?: string; revision?: number; reviewNote?: string | null; reviewedBy?: string | null; spvNames?: string[]; title?: string; date?: string; entryCount?: number; dirty?: boolean;
}
type Screen = { k: 'home' } | { k: 'start' } | { k: 'entry'; idx: number | null } | { k: 'section'; key: string };
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
  const [screen, setScreen] = useState<Screen>({ k: 'home' }); const [tab, setTab] = useState<'isi' | 'riwayat'>('isi');
  const [draft, setDraft] = useState<Answers>({}); const [errs, setErrs] = useState<Record<string, string>>({});
  const [tugas, setTugas] = useState<ReportType | ''>(user!.tugas.length === 1 ? user!.tugas[0] : '');
  const [busy, setBusy] = useState(false); const [online, setOnline] = useState(true);

  /** Salinan laporan di HP ditulis paling cepat tiap 0,4 detik (bukan setiap huruf): menulis laporan ber-ratus isian
   *  ke penyimpanan HP pada setiap ketukan membuat mengetik terasa berat. Ditulis seketika saat aplikasi ditutup/disembunyikan. */
  const pendingStore = useRef<{ r: Report | null } | null>(null); const storeTimer = useRef<number | undefined>(undefined);
  const flushStore = useCallback(() => { window.clearTimeout(storeTimer.current); if (pendingStore.current) { store.set(key('open'), pendingStore.current.r); pendingStore.current = null; } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const keep = useCallback((r: Report | null) => { pendingStore.current = { r }; window.clearTimeout(storeTimer.current); storeTimer.current = window.setTimeout(flushStore, 400); }, [flushStore]);
  const setOpen = useCallback((r: Report | null) => { setOpenState(r); keep(r); }, [keep]);
  const openRef = useRef(open); openRef.current = open;

  const load = useCallback(async () => {
    try {
      const [f, w, m] = await Promise.all([api<FormsPayload>('/forms'), store.get<any[]>('tt_wilayah') ?? api<any[]>('/wilayah'), api<any[]>('/reports/mine')]);
      setForms(f); store.set('tt_forms', f); store.set('tt_wilayah', w); setWil(indexKec(w));
      const list = m.map(fromServer); setMine(list); store.set(key('mine'), list);
      const srvOpen = list.find((r) => OPEN.includes(r.status));
      setOpenState((cur) => {
        const next = cur?.dirty && (!srvOpen || srvOpen.id === cur.id) ? cur : srvOpen ?? null; // perubahan offline di HP diutamakan
        keep(next); return next;
      });
      setOnline(true);
    } catch (e) { if (!(e instanceof ApiError)) setOnline(false); }
  }, [keep]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const w = store.get<any[]>('tt_wilayah'); if (w) setWil(indexKec(w)); load(); }, [load]);

  /** Simpan ke HP lalu ke server. Gagal karena sinyal → ditandai belum terkirim dan dicoba lagi otomatis.
   *  Simpanan dikirim SATU PER SATU (antrean): bila SPG menekan Simpan lagi / terus mengetik saat simpanan sebelumnya
   *  belum selesai (sinyal lambat), simpanan berikutnya menunggu lalu memakai nomor versi terbaru. Tanpa antrean,
   *  dua simpanan bersamaan saling bertabrakan ("diubah dari perangkat lain") dan ketikan terakhir bisa hilang. */
  const saving = useRef<Promise<unknown> | null>(null);
  const ver = useRef<Record<string, number>>({});
  /** Hasil: true = tersimpan di server, 'local' = tersimpan di HP saja (tanpa sinyal), false = ditolak. */
  const persist = useCallback(async (r: Report): Promise<boolean | 'local'> => {
    const local: Report = { ...r, dirty: true }; setOpen(local);
    while (saving.current) await saving.current.catch(() => undefined);
    const send = (version?: number) => api<any>(`/reports/${r.id}`, { method: 'PUT', body: body({ ...r, version }), query: { lite: 1 } });
    const run = (async (): Promise<boolean | 'local'> => {
      try {
        let s: any;
        try { s = await send(Math.max(ver.current[r.id] ?? 0, r.version ?? 0) || undefined); }
        catch (e) {
          // Versi di HP tertinggal (mis. simpanan sebelumnya baru selesai): ambil versi server lalu kirim ulang isian terbaru SPG.
          if (!(e instanceof ApiError && e.code === 'CONFLICT')) throw e;
          const srv = await api<any>(`/reports/${r.id}`, { query: { lite: 1 } });
          if (!srv || !OPEN.includes(srv.status)) throw e;
          s = await send(srv.version);
        }
        ver.current[r.id] = s.version;
        // Gabungkan ke isian TERKINI (bukan salinan saat simpan dimulai) agar ketikan selama menyimpan tidak hilang.
        setOpenState((cur) => {
          const n = cur && cur.id === r.id ? { ...cur, version: s.version, status: s.status, spvNames: s.spvNames, startedAt: s.startedAt, dirty: cur === local ? false : cur.dirty } : cur;
          keep(n); return n;
        });
        setOnline(true); return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) { const F0 = forms?.forms[r.type]; toast('error', (F0 && explain(e.details, F0)) || e.message); setOpenState((cur) => { const n = cur && cur.id === r.id ? { ...cur, dirty: false } : cur; keep(n); return n; }); return false; }
        if (e instanceof ApiError && (e.status === 409 || e.status === 410)) { toast('error', e.message); await load(); return false; }
        if (e instanceof ApiError) { toast('error', e.message); return false; }
        setOnline(false); return 'local'; // tersimpan di HP
      }
    })();
    saving.current = run;
    try { return await run; } finally { if (saving.current === run) saving.current = null; }
  }, [load, setOpen, toast, forms, keep]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const retry = () => { const cur = openRef.current; if (cur?.dirty && !saving.current) persist(cur); };
    const up = () => { setOnline(true); retry(); }; const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down); const t = setInterval(retry, 30_000);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t); };
  }, [persist]);
  /** Aplikasi dibiarkan terbuka seharian (mis. SPG Grosir dari pagi sampai tutup):
   *  - saat layar mati / pindah aplikasi: salinan di HP langsung ditulis (tidak ada isian yang hilang bila HP menutup aplikasinya);
   *  - saat dibuka lagi: isian yang belum terkirim dikirim, dan data disegarkan bila sudah > 5 menit (sesi login diperbarui otomatis). */
  const lastLoad = useRef(Date.now());
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { flushStore(); return; }
      const cur = openRef.current; if (cur?.dirty && !saving.current) persist(cur);
      if (Date.now() - lastLoad.current > 5 * 60_000) { lastLoad.current = Date.now(); load(); }
    };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', flushStore);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flushStore); };
  }, [persist, load, flushStore]);
  const editEntry = useCallback((i: number) => { const o = openRef.current; if (!o?.entries[i]) return; setDraft(structuredClone(o.entries[i])); setErrs({}); setScreen({ k: 'entry', idx: i }); scrollTo(0, 0); }, []);
  const deleteEntry = useCallback((i: number) => { const o = openRef.current; if (o) persist({ ...o, entries: o.entries.filter((_, j) => j !== i) }); }, [persist]);

  const variants = forms?.settings.variants ?? [];
  // Daftar usulan dihitung dari isian, BUKAN dari penutup yang sedang diketik → tidak dihitung ulang di setiap huruf.
  const oE = open?.entries, oS = open?.sections, oH = open?.header, oId = open?.id;
  const openLite = useMemo(() => (oId ? { id: oId, header: oH ?? {}, entries: oE ?? [], sections: oS ?? {}, closing: {} } as unknown as Report : null), [oId, oH, oE, oS]);
  const brands = useMemo(() => {
    const s = new Set<string>(); const all = [...mine, ...(openLite ? [openLite] : [])];
    all.forEach((r) => { r.entries.forEach((e) => [e.tier2, e.rokokBiasa, e.kompetitor].forEach((b) => b && s.add(titleCase(b))));
      Object.values(r.sections ?? {}).forEach((x) => x.items?.forEach((i) => i.merek && s.add(titleCase(i.merek)))); (r.closing?.terlaris ?? []).forEach((t: any) => t.merek && s.add(titleCase(t.merek))); });
    return [...s].sort();
  }, [mine, openLite]);
  /** Riwayat isian per pertanyaan dari laporan SPG ini (termasuk yang sedang dibuka): paling sering & terbaru dulu. */
  const history = useMemo(() => {
    const m = new Map<string, Map<string, { v: unknown; n: number; i: number }>>(); let order = 0;
    const add = (qid: string, v: unknown) => {
      if (v == null || v === '' || typeof v === 'boolean') return;
      let k: string;
      if (typeof v === 'object') { const o = v as Record<string, unknown>; if (typeof o.kode !== 'string' || typeof o.nama !== 'string') return; k = o.kode; }
      else { k = String(v).trim(); if (!k || k.length > 80) return; }
      const bucket = m.get(qid) ?? new Map(); const cur = bucket.get(k.toLowerCase());
      bucket.set(k.toLowerCase(), { v, n: (cur?.n ?? 0) + 1, i: Math.min(cur?.i ?? Infinity, order++) }); m.set(qid, bucket);
    };
    const all = [...(openLite ? [openLite] : []), ...mine.filter((r) => r.id !== openLite?.id)];
    for (const r of all) {
      const rows = [r.header ?? {}, r.closing ?? {}, ...[...(r.entries ?? [])].reverse(), ...Object.values(r.sections ?? {}).flatMap((x) => x.items ?? [])];
      for (const row of rows) for (const [k, v] of Object.entries(row)) { if (k !== 'at' && k !== 'terlaris') add(k, v); }
      for (const t of (r.closing?.terlaris ?? []) as { merek?: string }[]) add('__brands', t.merek);
    }
    brands.forEach((b) => add('__brands', b));
    return (qid: string) => [...(m.get(qid)?.values() ?? [])].sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.v);
  }, [mine, openLite, brands]);

  const ctx: QCtx | null = forms && wil ? {
    history,
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

  /** Dari tab Riwayat: buka lagi laporan untuk diubah (ditolak → Perbaiki; menunggu → ditarik; disetujui → revisi). */
  const reopen = async (r: Report) => {
    try {
      const res = await api<any>(`/reports/${r.id}/${r.status === 'REJECTED' ? 'rework' : 'edit'}`, { method: 'POST' });
      setOpen(fromServer(res)); setTab('isi'); setScreen({ k: 'home' }); setDraft({}); setErrs({});
      toast('success', r.status === 'APPROVED' ? 'Laporan dibuka lagi. Kirim ulang setelah diubah – supervisor akan memeriksa lagi.'
        : r.status === 'SUBMITTED' ? 'Laporan ditarik dari antrean. Ubah, lalu kirim lagi.' : 'Laporan dibuka kembali untuk diperbaiki');
      await load(); scrollTo(0, 0);
    } catch (e) { toast('error', (e as Error).message); }
  };

  /** Buka layar perbaikan untuk isian yang ditolak (data awal atau pembeli/responden/outlet ke-N). */
  const goFix = (d: unknown) => {
    if (!open || !F || !d || typeof d !== 'object') return;
    const det = d as Record<string, Record<string, string>>;
    if (det.header) { setDraft(structuredClone(open.header)); setErrs(det.header); setScreen({ k: 'start' }); scrollTo(0, 0); return; }
    const k = Object.keys(det).find((x) => x.startsWith('entries.'));
    if (k) { const i = +k.split('.')[1]; if (open.entries[i]) { setDraft(structuredClone(open.entries[i])); setErrs(det[k]); setScreen({ k: 'entry', idx: i }); scrollTo(0, 0); } return; }
    if (det.closing) setErrs(det.closing);
  };

  if (open && F && screen.k === 'start') {
    const save = async () => {
      const e = validate(F.start, draft, variants); setErrs(e);
      if (Object.keys(e).length) { toast('error', 'Lengkapi isian yang ditandai'); document.querySelector(`[data-qid="${Object.keys(e)[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      setBusy(true); const ok = await persist({ ...open, header: draft }); setBusy(false);
      if (ok) { setScreen({ k: 'home' }); setDraft({}); setErrs({}); toast('success', 'Data awal tersimpan'); scrollTo(0, 0); }
    };
    content = <>
      <Card title={F.start_title} sub="Data awal laporan ini"><Questions qs={F.start} value={draft} onChange={(a) => { setDraft(a); setErrs({}); }} errors={errs} ctx={ctx} idPrefix="start" /></Card>
      <Sticky><button className={cn(btn, 'bg-ink text-white shadow-[0_8px_20px_rgba(0,0,0,.2)] hover:bg-ink-deep')} disabled={busy} onClick={save}>Simpan data awal</button><button className="h-10 text-sm" onClick={() => { setScreen({ k: 'home' }); setDraft({}); setErrs({}); }}>Batal</button></Sticky></>;
  } else if (open && F && screen.k === 'entry') {
    const save = async () => {
      const e = validate(F.entry, draft, variants); setErrs(e);
      if (Object.keys(e).length) { toast('error', 'Lengkapi isian yang ditandai'); document.querySelector(`[data-qid="${Object.keys(e)[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
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
      const he = validate(F.start, open.header, variants);
      if (Object.keys(he).length) { toast('error', 'Data awal belum lengkap: ' + labelsOf(F.start, he)); goFix({ header: he }); return; }
      const bad = open.entries.findIndex((x) => Object.keys(validate(F.entry, x, variants)).length);
      if (bad >= 0) { const ee = validate(F.entry, open.entries[bad], variants); toast('error', `${entryTitle(open.type, open.entries[bad], bad)} belum lengkap: ${labelsOf(F.entry, ee)}`); goFix({ [`entries.${bad}`]: ee }); return; }
      setBusy(true);
      try {
        if (!(await persist(open))) return;                       // lewat antrean: menunggu simpanan lain selesai dulu
        await api(`/reports/${open.id}/submit`, { method: 'POST' });
        toast('success', open.status === 'REVISION' ? 'Revisi terkirim – menunggu persetujuan ulang' : 'Laporan terkirim – menunggu persetujuan supervisor');
        setOpen(null); setTugas(user!.tugas.length === 1 ? user!.tugas[0] : ''); await load(); scrollTo(0, 0);
      } catch (er) {
        if (er instanceof ApiError && er.status === 422) { toast('error', explain(er.details, F) || er.message); goFix(er.details); }
        else toast('error', er instanceof ApiError ? er.message : 'Kirim laporan butuh sinyal. Isian tetap tersimpan di HP.');
      }
      finally { setBusy(false); }
    };
    content = <>
      {open.status === 'REVISION' && !open.reviewNote && <div className="rounded-r-md border-l-4 border-ink bg-white/80 px-3 py-2 text-sm"><b>Sedang diubah</b> – setelah selesai, tekan <b>Kirim ulang</b>. Supervisor akan memeriksa lagi; data lama tetap dipakai sampai disetujui.</div>}
      {open.status === 'REVISION' && open.reviewNote && <div className="rounded-r-md border-l-4 border-critical bg-critical-soft px-3 py-2 text-sm"><b>Revisi</b> – alasan ditolak{open.reviewedBy ? ` oleh ${open.reviewedBy}` : ''}: {open.reviewNote}<div className="text-xs text-ink-muted">Perbaiki isian yang diminta, lalu tekan Kirim ulang.</div></div>}
      <Card title={reportTitle(open, F)} sub={`${kecFull(open.header[F.location_field])} · mulai ${fmtTime(open.startedAt)}`} badge={`${fmtNum(packs)} bks TT ${open.type === 'REGULER' ? 'diorder' : 'terjual'}`}>
        <div className="text-xs text-ink-secondary">Disetujui oleh: <b>{open.spvNames?.length ? [...new Set(open.spvNames)].join(', ') : ctx.spvFor!(open.header[F.location_field])}</b></div>
        {(() => { const he = validate(F.start, open.header, variants); const n = Object.keys(he).length; const g = open.header.lokasi;
          return <div className={cn('mt-2 flex items-center gap-2 rounded-glass-sm px-3 py-2 text-sm', n ? 'border border-critical/40 bg-critical-soft' : 'border border-line bg-white/60')} data-start-card>
            <div className="min-w-0 flex-1">{n ? <><b>Data awal belum lengkap:</b> {labelsOf(F.start, he)}</>
              : <><b>Data awal</b><div className="truncate text-xs text-ink-muted">{g ? `Lokasi ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}${g.acc != null ? ` · ± ${g.acc} m` : ''}` : 'Lengkap'}</div></>}</div>
            <button className={cn('shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold', n ? 'bg-ink text-white' : 'underline decoration-ink/30 decoration-2 underline-offset-4')}
              data-edit-start onClick={() => goFix({ header: n ? he : {} })}>{n ? 'Lengkapi' : 'Ubah'}</button></div>; })()}
        <EntryRows type={open.type} entries={open.entries} forms={forms} variants={variants} onEdit={editEntry} onDelete={deleteEntry} />
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
        <button className="h-10 text-sm" disabled={busy} onClick={async () => { const ok = await persist(open); if (ok) toast('success', ok === 'local' ? 'Disimpan di HP – terkirim otomatis saat ada sinyal' : 'Disimpan'); }}>Simpan sementara</button></Sticky></>;
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
        <span className="shrink-0 text-xs font-semibold">{labelOfStatus(r.status)}</span></div>) : <p className="py-3 text-center text-sm text-ink-muted">Belum ada laporan.</p>}
        {!!done.length && <button className="mt-2 text-sm font-semibold underline decoration-ink/30 decoration-2 underline-offset-4" onClick={() => { setTab('riwayat'); scrollTo(0, 0); }}>Lihat & ubah di Riwayat →</button>}</Card></>;
  }
  return <div className="relative min-h-screen"><TypographyBackground preset="mobile" density="light" /><div className="relative z-10">{head}<main className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-3 p-3 pb-10">
    {screen.k === 'home' && <div className="glass-minimal sticky top-[4.6rem] z-10 grid grid-cols-2 gap-1 !rounded-full p-1" role="tablist" aria-label="Menu SPG">
      {([['isi', open ? 'Laporan aktif' : 'Isi laporan'], ['riwayat', `Riwayat (${mine.length})`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} data-tab={k}
        className={cn('h-10 rounded-full text-sm font-semibold transition-colors duration-200', tab === k ? 'bg-ink text-white shadow' : 'text-ink-secondary hover:bg-white/70')}
        onClick={() => { setTab(k); scrollTo(0, 0); }}>{l}</button>)}</div>}
    {screen.k === 'home' && tab === 'riwayat' ? <History mine={mine} forms={forms} openId={open?.id} onEdit={reopen} onContinue={() => { setTab('isi'); scrollTo(0, 0); }} /> : <>
    {open && F && screen.k === 'home' && <div className="enter px-1 pt-3"><div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.2em] text-ink-muted"><PlusMark className="h-2.5 w-2.5" />{TYPE_LABEL[open.type]}</div><h1 className="text-2xl font-bold tracking-tight">{F.title}</h1></div>}{content}</>}</main></div></div>;
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

/** Label pertanyaan untuk daftar kesalahan, mis. "Lokasi kamu sekarang, Nama outlet". */
function labelsOf(qs: Question[], e: Record<string, unknown>) { return Object.keys(e).map((id) => qs.find((q) => q.id === id)?.label ?? id).join(', '); }

/** Ubah rincian penolakan server menjadi kalimat yang dimengerti SPG. */
function explain(d: unknown, F: FormDef): string {
  if (!d || typeof d !== 'object') return '';
  const word = F.entry_word.charAt(0).toUpperCase() + F.entry_word.slice(1); const out: string[] = [];
  for (const [k, v] of Object.entries(d as Record<string, any>)) {
    if (k === 'submit') { out.push(...(Array.isArray(v) ? v : [])); continue; }
    const m = /^(.+)\.(\d+)$/.exec(k); let where = k; let qs: Question[] = [];
    if (k === 'header') { where = 'Data awal'; qs = F.start; }
    else if (k === 'closing') { where = 'Penutup'; qs = F.closing; }
    else if (m && m[1] === 'entries') { where = `${word} ke-${+m[2] + 1}`; qs = F.entry; }
    else if (m) { const sec = F.sections.find((x) => x.key === m[1]); where = sec ? sec.title.split('·')[0].trim() : m[1]; qs = sec?.questions ?? []; }
    if (v && typeof v === 'object') out.push(`${where}: ${labelsOf(qs, v)}`);
  }
  return out.length ? 'Belum lengkap – ' + out.slice(0, 3).join(' · ') + (out.length > 3 ? ` (+${out.length - 3} lagi)` : '') : '';
}

const HIST_LABEL: Record<string, string> = { DIBUAT: 'Dibuat', DISIMPAN: 'Disimpan', DIKIRIM: 'Dikirim', DIKIRIM_ULANG: 'Dikirim ulang', DISETUJUI: 'Disetujui',
  DITOLAK: 'Ditolak', DIKERJAKAN_ULANG: 'Dibuka untuk diperbaiki', DITARIK: 'Ditarik untuk diubah', ISIAN_DIHAPUS: 'Isian dihapus supervisor/admin',
  DIHAPUS: 'Dihapus admin', DIPULIHKAN: 'Dipulihkan' };
const STATUS_TONE: Record<string, string> = { DRAFT: 'bg-white text-ink border border-line-strong', REVISION: 'bg-white text-ink border border-line-strong',
  SUBMITTED: 'bg-warn-soft text-warn-text', APPROVED: 'bg-good-soft text-good-text', REJECTED: 'bg-critical-soft text-critical-text' };

/** Tab Riwayat: semua laporan SPG + riwayat simpannya, dan tombol untuk mengubah lagi. */
function History({ mine, forms, openId, onEdit, onContinue }: { mine: Report[]; forms: FormsPayload; openId?: string; onEdit: (r: Report) => Promise<void>; onContinue: () => void }) {
  const [show, setShow] = useState<string | null>(null); const [ask, setAsk] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [det, setDet] = useState<Record<string, any>>({});
  useEffect(() => { if (show && !det[show]) api<any>(`/reports/${show}`).then((d) => setDet((x) => ({ ...x, [show]: d }))).catch(() => undefined); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mine.length) return <Card title="Riwayat laporan"><p className="py-3 text-center text-sm text-ink-muted">Belum ada laporan.</p></Card>;
  return <Card title="Riwayat laporan" sub="Ketuk laporan untuk melihat isi & riwayat simpannya">
    <div className="divide-y divide-border" data-history>{mine.map((r) => {
      const F = forms.forms[r.type]; const isOpen = OPEN.includes(r.status); const d = det[r.id];
      const action = isOpen ? (r.id === openId ? 'Lanjutkan mengisi' : null) : r.status === 'REJECTED' ? 'Perbaiki' : r.status === 'SUBMITTED' ? 'Tarik & ubah' : r.status === 'APPROVED' ? 'Ubah lagi' : null;
      const blocked = !isOpen && !!openId && action != null;
      const warn = r.status === 'SUBMITTED' ? 'Laporan ditarik dari antrean supervisor. Setelah diubah, kirim lagi.'
        : r.status === 'APPROVED' ? 'Laporan sudah disetujui. Setelah diubah harus dikirim ulang dan disetujui lagi; data lama tetap dipakai sampai itu.' : null;
      return <div key={r.id} className="py-2.5" data-hist-row={r.id}>
        <button className="flex w-full items-center gap-2 text-left" onClick={() => setShow(show === r.id ? null : r.id)} aria-expanded={show === r.id}>
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.title || '–'}</div>
            <div className="text-xs text-ink-muted">{TYPE_LABEL[r.type]} · {fmtDate(r.startedAt)} · {r.entryCount ?? r.entries.length} {F.entry_word}{r.updatedAt ? ` · disimpan ${fmtTime(r.updatedAt)}` : ''}</div></div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-2xs font-semibold', STATUS_TONE[r.status] ?? 'bg-white')}>{labelOfStatus(r.status)}</span></button>
        {show === r.id && <div className="mt-2 grid gap-2 rounded-glass-sm border border-line bg-white/60 p-3 text-sm">
          {!d ? <p className="text-ink-muted">Memuat…</p> : <>
            {r.reviewNote && <div className="rounded-r-md border-l-4 border-critical bg-critical-soft px-2 py-1"><b>Alasan ditolak:</b> {r.reviewNote}</div>}
            <div><b>Isian ({(d.data?.entries ?? []).length}):</b> {(d.data?.entries ?? []).map((e: Answers, i: number) => entryTitle(r.type, e, i)).join(', ') || '–'}</div>
            <ol className="grid gap-1 border-l border-line pl-3" data-hist-log>{(d.log ?? []).map((l: any, i: number) => <li key={i}>
              <span className={cn('font-medium', /HAPUS|TOLAK/.test(l.action) && 'text-critical-text')}>{HIST_LABEL[l.action] ?? l.action}</span>
              <span className="text-ink-muted"> · {fmtDate(l.at)} {fmtTime(l.at)}{l.by ? ` · ${l.by}` : ''}</span>{l.note ? <div className="text-xs text-ink-secondary">{l.note}</div> : null}</li>)}</ol>
          </>}
          {action && (blocked ? <p className="text-xs text-ink-muted">Kirim atau selesaikan laporan yang sedang dibuka dulu, baru laporan ini bisa diubah.</p>
            : isOpen ? <button className="h-11 rounded-glass-sm bg-ink font-semibold text-white" onClick={onContinue}>{action}</button>
            : ask === r.id || !warn ? <>{warn && <p className="text-xs text-ink-secondary">{warn}</p>}
                <button className="h-11 rounded-glass-sm bg-ink font-semibold text-white disabled:opacity-50" disabled={busy} data-reopen={r.id}
                  onClick={async () => { setBusy(true); await onEdit(r); setBusy(false); setAsk(null); }}>{warn ? `Ya, ${action.toLowerCase()}` : action}</button></>
            : <button className="h-11 rounded-glass-sm border border-ink bg-white font-semibold" data-reopen-ask={r.id} onClick={() => setAsk(r.id)}>{action}</button>)}
        </div>}
      </div>; })}</div></Card>;
}

/** Daftar isian laporan yang sedang dibuka. Dibungkus memo: tidak digambar ulang saat SPG mengetik di bagian lain
 *  (penting saat isiannya sudah ratusan, mis. SPG Grosir seharian). */
const EntryRows = memo(function EntryRows({ type, entries, forms, variants, onEdit, onDelete }: { type: ReportType; entries: Answers[]; forms: FormsPayload; variants: string[];
  onEdit: (i: number) => void; onDelete: (i: number) => void }) {
  const F = forms.forms[type];
  return <div className="mt-2 divide-y divide-border">{entries.map((e, i) => <div key={`${i}-${e.at ?? ''}`} className="flex items-center gap-2 py-2">
    <div className="min-w-0 flex-1"><div className="truncate font-medium">{entryTitle(type, e, i)}</div><div className="truncate text-xs text-ink-muted">{entrySub(type, e, forms)}</div>
      {Object.keys(validate(F.entry, e, variants)).length > 0 && <div className="text-xs font-semibold text-critical-text">Belum lengkap – ketuk Ubah</div>}</div>
    {(e.foto || e.fotoDisplay) && <Photo value={e.foto || e.fotoDisplay} alt="Foto" className="h-10 w-10" />}
    <button className="rounded-md px-2 py-1 text-sm font-semibold underline decoration-ink/30 decoration-2 underline-offset-4" onClick={() => onEdit(i)}>Ubah</button>
    <button className="rounded-md px-2 py-1 text-sm text-critical-text" onClick={() => onDelete(i)} aria-label={`Hapus ${entryTitle(type, e, i)}`}>Hapus</button></div>)}</div>;
});

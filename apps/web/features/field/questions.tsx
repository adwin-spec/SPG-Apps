'use client';
import { useState } from 'react';
import { Camera, Minus, Plus } from 'lucide-react';
import { Photo } from '@/components/photo';
import { cn } from '@/lib/utils';
import { fieldBase } from '@/components/ui/glass-input';
import type { Kec } from '@/lib/types';
import { type Answers, type KecIndex, type Question, lab, optionsOf, searchKec, shortKab, sumVariants, val, visible } from './engine';
import { uploadPhoto } from './photo';

export interface QCtx { variants: string[]; kec: KecIndex; suggest: (k: string) => string[]; preferKab?: string; stamp: () => string; spvFor?: (k: Kec) => string }

const chip = 'relative inline-flex min-h-10 cursor-pointer select-none items-center rounded-full border border-line-strong bg-white/70 px-3.5 py-2 text-sm font-medium transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-white  has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';
const inputCls = cn(fieldBase, 'h-11 text-base');

/** Menampilkan pertanyaan dari definisi backend. Setiap perubahan langsung membersihkan jawaban yang tidak lagi relevan. */
export function Questions({ qs, value, onChange, errors, ctx, idPrefix = 'q' }: { qs: Question[]; value: Answers; onChange: (a: Answers) => void; errors: Record<string, string>; ctx: QCtx; idPrefix?: string }) {
  const { shown, clean } = visible(qs, value, ctx.variants);
  const set = (id: string, v: unknown) => onChange(visible(qs, { ...value, [id]: v }, ctx.variants).clean);
  return <div className="grid gap-3">{shown.map((q) => {
    const err = errors[q.id]; const v = clean[q.id]; const hid = `${idPrefix}_${q.id}`;
    return <div key={q.id} data-qid={q.id} className={cn('glass-nested grid gap-2 p-3.5 transition-colors', err && '!border-critical bg-critical-soft')} role="group" aria-labelledby={hid}>
      <div id={hid} className="font-bold">{q.label}{!q.required && <span className="ml-1 text-xs font-normal text-ink-muted">(opsional)</span>}</div>
      {q.hint && <div className="-mt-1 text-xs text-ink-muted">{q.hint}</div>}
      <Control q={q} v={v} a={clean} set={(x) => set(q.id, x)} ctx={ctx} />
      {err && <div role="alert" className="text-xs text-critical-text">{err}</div>}
    </div>; })}</div>;
}

function Control({ q, v, a, set, ctx }: { q: Question; v: any; a: Answers; set: (v: unknown) => void; ctx: QCtx }) {
  const opts = optionsOf(q, a, ctx.variants);
  switch (q.type) {
    case 'single':
      return <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>{opts.map((o) => <label key={val(o)} className={chip}>
        <input type="radio" className="absolute opacity-0" name={q.id} checked={v === val(o)} onChange={() => set(val(o))} />{lab(o)}</label>)}</div>;
    case 'multi':
      return <div className="flex flex-wrap gap-2">{opts.map((o) => <label key={val(o)} className={chip}>
        <input type="checkbox" className="absolute opacity-0" checked={(v ?? []).includes(val(o))} onChange={(e) => set(e.target.checked ? [...(v ?? []), val(o)] : (v ?? []).filter((x: string) => x !== val(o)))} />{lab(o)}</label>)}</div>;
    case 'confirm':
      return <label className={chip}><input type="checkbox" className="absolute opacity-0" name={q.id} checked={!!v} onChange={(e) => set(e.target.checked)} />{q.text}</label>;
    case 'text': {
      const list = q.suggest ? ctx.suggest(q.suggest) : [];
      return <><input className={inputCls} name={q.id} value={v ?? ''} placeholder={q.placeholder} list={list.length ? `dl_${q.id}` : undefined} autoComplete="off" onChange={(e) => set(e.target.value)} aria-label={q.label} />
        {!!list.length && <datalist id={`dl_${q.id}`}>{list.map((x) => <option key={x} value={x} />)}</datalist>}</>;
    }
    case 'textarea':
      return <textarea className={cn(inputCls, 'h-20 py-2')} name={q.id} value={v ?? ''} placeholder={q.placeholder} onChange={(e) => set(e.target.value)} aria-label={q.label} />;
    case 'number':
      return <input className={inputCls} type="number" min={0} inputMode="numeric" name={q.id} value={v ?? ''} placeholder={q.placeholder} onChange={(e) => set(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))} aria-label={q.label} />;
    case 'variants':
      return <div>{ctx.variants.map((k) => { const n = Number(v?.[k] ?? 0); const put = (x: number) => set({ ...Object.fromEntries(ctx.variants.map((z) => [z, Number(v?.[z] ?? 0)])), [k]: Math.max(0, x) });
        return <div key={k} className="flex items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0">
          <span>{k} <span className="text-xs text-ink-muted">bks</span></span>
          <div className="flex items-center gap-1.5">
            <button type="button" className="grid h-10 w-10 place-items-center rounded-glass-sm border border-line-strong bg-white/70" onClick={() => put(n - 1)} aria-label={`Kurangi ${k}`}><Minus className="h-4 w-4" /></button>
            <input className="h-10 w-16 rounded-glass-sm border border-line-strong bg-white/70 text-center font-bold" type="number" min={0} inputMode="numeric" value={n} aria-label={k} onChange={(e) => put(Math.round(Number(e.target.value) || 0))} />
            <button type="button" className="grid h-10 w-10 place-items-center rounded-glass-sm border border-line-strong bg-white/70" onClick={() => put(n + 1)} aria-label={`Tambah ${k}`}><Plus className="h-4 w-4" /></button>
          </div></div>; })}
        <div className="pt-1 text-right text-xs text-ink-muted">Total {sumVariants(v)} bks</div></div>;
    case 'stok':
      return <div>{ctx.variants.map((k) => <div key={k} className="grid grid-cols-[7rem_1fr] items-center gap-2 border-t border-line py-1.5 first:border-t-0">
        <span>{k}</span><div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Stok ${k}`}>{(q.options as [string, string][]).map((o) => <label key={o[0]} className={cn(chip, 'min-h-8 px-3 py-1 text-[13px]')}>
          <input type="radio" className="absolute opacity-0" name={`${q.id}_${k}`} checked={v?.[k] === o[0]} onChange={() => set({ ...(v ?? {}), [k]: o[0] })} />{o[1]}</label>)}</div></div>)}</div>;
    case 'brandcounts': {
      const rows: { merek?: string; batang?: number }[] = Array.from({ length: q.rows ?? 3 }, (_, i) => v?.[i] ?? {});
      const put = (i: number, patch: object) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r) => r.merek || r.batang != null));
      const list = ctx.suggest('brands');
      return <div className="grid gap-2">{rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_8rem] gap-2">
        <input className={inputCls} list="dl_brandcounts" value={r.merek ?? ''} placeholder={`Merek ${i + 1}`} aria-label={`Merek ${i + 1}`} onChange={(e) => put(i, { merek: e.target.value })} />
        <input className={inputCls} type="number" min={0} inputMode="numeric" value={r.batang ?? ''} placeholder="Batang" aria-label={`Jumlah batang merek ${i + 1}`} onChange={(e) => put(i, { batang: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </div>)}<datalist id="dl_brandcounts">{list.map((x) => <option key={x} value={x} />)}</datalist></div>;
    }
    case 'kecamatan': return <KecPicker q={q} v={v} set={set} ctx={ctx} />;
    case 'photo': return <PhotoInput q={q} v={v} set={set} ctx={ctx} />;
  }
  return null;
}

function KecPicker({ q, v, set, ctx }: { q: Question; v: any; set: (v: unknown) => void; ctx: QCtx }) {
  const [term, setTerm] = useState('');
  if (v && typeof v === 'object') return <div className="grid gap-1.5">
    <div className="flex items-center justify-between gap-3 rounded-glass-sm bg-ink px-3 py-2 text-white"><span><b>{v.nama}</b><div className="text-xs text-white/65">{v.kab} · {v.prov}</div></span>
      <button type="button" className="rounded-glass-sm border border-line-strong bg-white/70 px-3 py-1.5 text-sm font-semibold" onClick={() => set(undefined)}>Ganti</button></div>
    {q.location && ctx.spvFor && <div className="text-xs text-ink-secondary">Disetujui oleh: <b>{ctx.spvFor(v)}</b></div>}</div>;
  const res = searchKec(ctx.kec, term, ctx.preferKab);
  return <div className="grid gap-1.5">
    <input className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Ketik nama kecamatan, contoh: Sokaraja" autoComplete="off" aria-label={q.label} data-kecq={q.id} />
    {!!res.length && <div role="listbox" className="max-h-64 overflow-y-auto rounded-glass-sm border border-line-strong bg-white/70">{res.map((c) =>
      <button key={c.kode} type="button" role="option" aria-selected={false} className="block w-full border-t border-line px-3 py-2 text-left first:border-t-0 hover:bg-black/[.04]" onClick={() => { set(c); setTerm(''); }}>
        <b>{c.nama}</b> <span className="text-xs text-ink-muted">{shortKab(c.kab)} · {c.prov}</span></button>)}</div>}
    {term.trim().length >= 2 && !res.length && <p className="text-xs text-ink-muted">Tidak ditemukan. Kecamatan baru bisa ditambahkan admin pusat di menu Wilayah.</p>}
  </div>;
}

function PhotoInput({ q, v, set, ctx }: { q: Question; v: any; set: (v: unknown) => void; ctx: QCtx }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return; setBusy(true); setErr('');
    try { set(await uploadPhoto(f, ctx.stamp())); }
    catch (e) { setErr(navigator.onLine ? (e as Error).message : 'Foto butuh sinyal internet. Coba lagi saat sinyal ada.'); }
    finally { setBusy(false); }
  };
  const input = <input type="file" accept="image/*" capture={q.capture ?? 'environment'} className="absolute h-px w-px opacity-0" data-photo={q.id} onChange={(e) => pick(e.target.files?.[0])} />;
  return <div className="grid gap-2">
    {v ? <div className="flex flex-wrap items-center gap-3"><Photo value={v} alt={q.label} className="h-28 w-28" />
      <label className="relative inline-flex h-10 cursor-pointer items-center rounded-glass-sm border border-line-strong bg-white/80 px-3 text-sm font-semibold has-[:focus-visible]:ring-2">Ganti foto{input}</label>
      <button type="button" className="h-10 rounded-lg px-3 text-sm text-critical-text" onClick={() => set(undefined)}>Hapus foto</button></div>
      : <label className="relative flex h-14 cursor-pointer items-center justify-center gap-2 rounded-glass-sm border border-dashed border-ink/40 bg-white/60 font-semibold text-ink hover:bg-black/[.04] has-[:focus-visible]:ring-2">
        <Camera className="h-5 w-5" />{busy ? 'Mengunggah foto…' : 'Ambil foto'}{input}</label>}
    {err && <div role="alert" className="text-xs text-critical-text">{err}</div>}
  </div>;
}

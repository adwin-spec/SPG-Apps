'use client';
/** Checklist kabupaten/kota (dikelompokkan per provinsi, bisa dicari). Dipakai untuk area SPG & wilayah supervisor. */
import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortKab } from '@/features/field/engine';
import { useWilayah } from './hooks';

export function KabChecklist({ value, onChange, id = 'kab', compact = false }: { value: string[]; onChange: (v: string[]) => void; id?: string; compact?: boolean }) {
  const wil = useWilayah(); const [q, setQ] = useState(''); const [openProv, setOpenProv] = useState<string | null>(null);
  const rows = wil.data ?? [];
  const names = useMemo(() => new Map(rows.map((k) => [k.kode, shortKab(k.nama)])), [rows]);
  const provs = useMemo(() => {
    const t = q.trim().toLowerCase(); const m = new Map<string, { kode: string; nama: string; kabs: { kode: string; nama: string }[] }>();
    for (const k of rows) {
      if (t && !k.nama.toLowerCase().includes(t) && !k.provinsi.toLowerCase().includes(t)) continue;
      const p = m.get(k.provKode) ?? { kode: k.provKode, nama: k.provinsi, kabs: [] }; p.kabs.push({ kode: k.kode, nama: shortKab(k.nama) }); m.set(k.provKode, p);
    }
    return [...m.values()];
  }, [rows, q]);
  const set = new Set(value);
  const toggle = (k: string) => onChange(set.has(k) ? value.filter((x) => x !== k) : [...value, k]);
  const all = (kabs: { kode: string }[], on: boolean) => onChange(on ? [...new Set([...value, ...kabs.map((k) => k.kode)])] : value.filter((x) => !kabs.some((k) => k.kode === x)));
  if (wil.isLoading) return <p className="text-sm text-ink-muted">Memuat daftar kab/kota…</p>;
  return <div className="grid gap-2" data-kab-checklist={id}>
    {!!value.length && <div className="flex flex-wrap gap-1.5" aria-label="Kab/kota terpilih">{value.map((k) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-ink py-0.5 pl-2.5 pr-1 text-xs font-semibold text-white">
      {names.get(k) ?? k}<button type="button" className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20" aria-label={`Hapus ${names.get(k) ?? k}`} onClick={() => toggle(k)}><X className="h-3 w-3" /></button></span>)}</div>}
    <input type="search" className="h-9 rounded-[10px] border border-line-strong bg-white/70 px-2.5 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15"
      placeholder="Cari kab/kota atau provinsi…" aria-label="Cari kab/kota" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className={cn('overflow-y-auto overscroll-contain rounded-[12px] border border-line bg-white/50', compact ? 'max-h-60' : 'max-h-72')}>
      {provs.map((p) => { const on = p.kabs.filter((k) => set.has(k.kode)).length; const expanded = !!q.trim() || openProv === p.kode || provs.length === 1;
        return <div key={p.kode} className="border-b border-line last:border-b-0">
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold" aria-expanded={expanded} onClick={() => setOpenProv(expanded && !q.trim() ? null : p.kode)}>
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', !expanded && '-rotate-90')} />{p.nama}
              <span className="text-xs font-normal text-ink-muted">{on ? `${on} dari ${p.kabs.length} dipilih` : `${p.kabs.length} kab/kota`}</span></button>
            <button type="button" className="shrink-0 text-xs font-semibold underline underline-offset-2" onClick={() => all(p.kabs, on < p.kabs.length)}>{on < p.kabs.length ? 'Pilih semua' : 'Kosongkan'}</button></div>
          {expanded && <div className="grid grid-cols-1 gap-1 px-3 pb-3 sm:grid-cols-2">{p.kabs.map((k) => <label key={k.kode}
            className={cn('flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 text-sm transition-colors', set.has(k.kode) ? 'border-ink bg-ink/[.06] font-semibold' : 'border-transparent hover:bg-white')}>
            <input type="checkbox" className="sr-only" checked={set.has(k.kode)} onChange={() => toggle(k.kode)} data-kab={k.kode} />
            <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', set.has(k.kode) ? 'border-ink bg-ink text-white' : 'border-ink/40 bg-white')} aria-hidden>{set.has(k.kode) && <Check className="h-3 w-3" />}</span>{k.nama}</label>)}</div>}
        </div>; })}
      {!provs.length && <p className="p-3 text-sm text-ink-muted">Tidak ada kab/kota yang cocok.</p>}
    </div></div>;
}

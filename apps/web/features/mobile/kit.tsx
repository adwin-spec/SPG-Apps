'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { z } from 'zod';
import { stagePhoto } from '@/lib/offline/outbox';
import { cn } from '@/lib/utils';

const ZERO = '00000000-0000-4000-8000-000000000000';
/** Validate an outbox payload with the SHARED Zod schema; offline placeholders are swapped for a dummy UUID only for validation. */
export function validatePayload<T extends z.ZodType>(schema: T, payload: unknown): { ok: true } | { ok: false; errors: Record<string, string> } {
  const swap = (v: unknown): unknown => typeof v === 'string' && /^(client|file):/.test(v) ? ZERO
    : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
  const r = schema.safeParse(swap(payload));
  if (r.success) return { ok: true };
  return { ok: false, errors: Object.fromEntries(r.error.issues.map((i) => [i.path.join('.') || 'form', i.message])) };
}

export function MField({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>{children}
    {error ? <span role="alert" className="mt-1 block text-xs text-critical-text">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}</label>;
}
export const mInput = 'h-11 w-full rounded-lg border border-border bg-white px-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function MButton({ className, variant = 'primary', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'success' }) {
  return <button {...p} className={cn('flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold disabled:opacity-50',
    variant === 'primary' && 'bg-primary text-white active:bg-primary-hover', variant === 'secondary' && 'border border-border bg-white text-ink',
    variant === 'danger' && 'bg-critical text-white', variant === 'success' && 'bg-good-text text-white', className)} />;
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('rounded-xl border border-border bg-white p-4', className)} {...p} />; }

/** Photo evidence: captured with the camera, stored in IndexedDB, uploaded by the outbox (works offline). */
export function PhotoInput({ value, onChange, label = 'Photo evidence' }: { value: string | null; onChange: (key: string | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('Photo is larger than 10 MB'); return; }
    const blob = await downscale(f);
    const key = await stagePhoto(blob, f.name.replace(/\.[^.]+$/, '') + '.jpg');
    setPreview(URL.createObjectURL(blob)); onChange(key);
  };
  return <div>
    <span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>
    {preview ? <div className="relative inline-block"><img src={preview} alt="Captured evidence" className="h-28 w-28 rounded-lg object-cover" />
      <button type="button" aria-label="Remove photo" onClick={() => { setPreview(null); onChange(null); }} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow"><X className="h-4 w-4" /></button></div>
      : <button type="button" onClick={() => ref.current?.click()} className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-ink-secondary"><Camera className="h-5 w-5" />Take photo</button>}
    <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    {value && <span className="mt-1 block text-2xs text-ink-muted">Saved on device – uploads automatically.</span>}
  </div>;
}

/** Downscale to ≤1600px JPEG to keep uploads small on mobile data. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.82));
  } catch { return file; }
}

export function SearchSelect<T extends { id: string }>({ items, value, onChange, label, render, placeholder = 'Search…', error }: { items: T[]; value: string | null; onChange: (id: string) => void; label: string; render: (t: T) => string; placeholder?: string; error?: string }) {
  const [q, setQ] = useState('');
  const selected = items.find((i) => i.id === value);
  const list = items.filter((i) => render(i).toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return <MField label={label} error={error}>
    {selected && <div className="mb-2 flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2 text-sm"><span className="font-medium">{render(selected)}</span><button type="button" className="text-xs text-primary" onClick={() => onChange('')}>Change</button></div>}
    {!selected && <><input className={mInput} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-white">{list.map((i) => <li key={i.id}><button type="button" onClick={() => { onChange(i.id); setQ(''); }} className="block w-full border-b border-border px-3 py-2.5 text-left text-sm last:border-0 active:bg-surface">{render(i)}</button></li>)}
        {!list.length && <li className="px-3 py-3 text-sm text-ink-muted">No match</li>}</ul></>}
  </MField>;
}

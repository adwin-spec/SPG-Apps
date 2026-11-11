'use client';
import { useEffect, useState } from 'react';
import { blobUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

const cache = new Map<string, Promise<string>>();
/** Foto lapangan dimuat dengan token login (tidak pernah lewat URL publik). Klik untuk memperbesar. */
export function Photo({ value, alt, className }: { value: any; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null); const [err, setErr] = useState(false); const [big, setBig] = useState(false);
  const id = value && typeof value === 'object' ? value.id : null;
  useEffect(() => {
    if (!id) return;
    if (!cache.has(id)) cache.set(id, blobUrl(`/photos/${id}`));
    cache.get(id)!.then(setSrc).catch(() => { cache.delete(id); setErr(true); });
  }, [id]);
  const box = cn('h-16 w-16 shrink-0 rounded-md border border-line bg-black/[.03] object-cover', className);
  if (value?.sample) return <span className={cn(box, 'inline-grid place-items-center text-center text-[10px] text-ink-muted')}>Contoh<br />foto</span>;
  if (!id || err) return <span className={cn(box, 'inline-grid place-items-center text-center text-[10px] text-ink-muted')}>Foto tidak tersedia</span>;
  if (!src) return <span className={cn(box, 'inline-block animate-pulse')} />;
  return <>
    <button type="button" onClick={() => setBig(true)} className="shrink-0 cursor-zoom-in" aria-label={`Perbesar ${alt}`}><img src={src} alt={alt} className={box} /></button>
    {big && <div role="dialog" aria-label={alt} className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setBig(false)}>
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg" /></div>}
  </>;
}

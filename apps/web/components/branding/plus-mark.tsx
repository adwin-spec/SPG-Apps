import { cn } from '@/lib/utils';

export type PlusVariant = 'solid-black' | 'solid-white' | 'outline' | 'glass';
/** Tanda "+" – identitas utama Tanda Tambah. Geometris, simetris, garis tebal. */
export function PlusMark({ variant = 'solid-black', className, title }: { variant?: PlusVariant; className?: string; title?: string }) {
  const d = 'M37 4h26v33h33v26H63v33H37V63H4V37h33z';
  const common = { viewBox: '0 0 100 100', className: cn('h-8 w-8', className), role: title ? 'img' : undefined, 'aria-hidden': title ? undefined : true, 'aria-label': title } as const;
  if (variant === 'outline') return <svg {...common}><path d={d} fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="miter" /></svg>;
  if (variant === 'glass') return <svg {...common}>
    <defs><linearGradient id="ttglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity=".35" /></linearGradient></defs>
    <path d={d} fill="url(#ttglass)" stroke="rgba(255,255,255,.95)" strokeWidth={1.5} /><path d={d} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={1} /></svg>;
  return <svg {...common}><path d={d} fill={variant === 'solid-white' ? '#ffffff' : '#111111'} /></svg>;
}

/** Logo aplikasi: plus putih di atas kotak hitam membulat + nama. */
export function BrandLogo({ collapsed, onDark }: { collapsed?: boolean; onDark?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-ink shadow-glass"><PlusMark variant="solid-white" className="h-5 w-5" /></span>
    {!collapsed && <span className="leading-none"><span className={cn('block text-[15px] font-extrabold tracking-tight', onDark ? 'text-white' : 'text-ink')}>TANDA TAMBAH</span>
      <span className={cn('mt-1 block text-2xs font-medium uppercase tracking-[0.18em]', onDark ? 'text-white/60' : 'text-ink-muted')}>Field intelligence</span></span>}
  </div>;
}

/** Indikator memuat: plus yang berputar perlahan. */
export function PlusLoader({ label = 'Memuat…' }: { label?: string }) {
  return <div role="status" className="flex flex-col items-center gap-3 text-sm text-ink-muted">
    <PlusMark className="h-8 w-8 [animation:tt-spin-plus_1.2s_var(--tt-ease)_infinite_alternate]" />{label}</div>;
}

/** Pemisah bagian dengan plus kecil di tengah. */
export function PlusDivider({ className }: { className?: string }) {
  return <div className={cn('flex items-center gap-3 text-ink-gray', className)} aria-hidden><span className="h-px flex-1 bg-line" /><PlusMark variant="outline" className="h-3 w-3" /><span className="h-px flex-1 bg-line" /></div>;
}

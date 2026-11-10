import { cn } from '@/lib/utils';

/** Logo: tanda "+" putih di atas cipratan cat merah (bentuk digambar sendiri, terinspirasi kemasan). */
export function Logo({ className, plusClass }: { className?: string; plusClass?: string }) {
  return <svg viewBox="0 0 48 48" className={cn('h-9 w-9', className)} aria-hidden>
    <path d="M9 14c3-7 13-10 19-8 6 1 13 4 14 11 2 6-1 11 1 16 1 5-4 10-10 11-6 2-11-1-17 0-6 1-12-3-12-9 0-5 3-7 2-12-1-3 1-6 3-9z" fill="#d42a1f" />
    <path d="M38 8c2-1 4 0 4 2s-2 3-3 2-2-3-1-4zM5 37c1-1 3 0 3 1s-1 2-2 2-2-2-1-3z" fill="#d42a1f" />
    <path d="M21 9h6.5v12.5H40V28H27.5v12H21V28H8.5v-6.5H21z" className={cn('fill-paper-card', plusClass)} />
  </svg>;
}

/** Sapuan kuas merah di bawah judul. */
export function Brush({ className }: { className?: string }) {
  return <svg viewBox="0 0 300 18" preserveAspectRatio="none" className={cn('h-3 w-full', className)} aria-hidden>
    <path d="M3 11c40-6 90-9 150-8 50 1 95 2 144 6-30 1-60 4-95 4-62 1-128 3-199-2z" fill="#d42a1f" />
  </svg>;
}

/** Judul halaman bergaya spidol dengan sapuan kuas. */
export function Marker({ children, className, as: As = 'h1' }: { children: React.ReactNode; className?: string; as?: 'h1' | 'h2' | 'span' }) {
  return <As className={cn('relative inline-block font-marker leading-tight tracking-wide', className)}>
    <span className="relative z-10">{children}</span><Brush className="absolute -bottom-1 left-0 z-0 opacity-90" /></As>;
}

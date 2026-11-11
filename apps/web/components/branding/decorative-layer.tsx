/** Lapisan grafis: plus raksasa terpotong, garis tipis, bentuk geometris kecil. Murni CSS/SVG ringan. */
import { cn } from '@/lib/utils';
import { PlusMark } from './plus-mark';

export function DecorativeLayer({ className, plus = 'right' }: { className?: string; plus?: 'right' | 'left' | 'none' }) {
  return <div aria-hidden className={cn('bg-layer pointer-events-none fixed inset-0 z-0 overflow-hidden', className)}>
    {plus !== 'none' && <PlusMark variant="outline" className={cn('absolute h-[70vh] w-[70vh] text-ink opacity-[0.05]', plus === 'right' ? '-right-[18vh] -top-[12vh]' : '-left-[22vh] bottom-[-18vh]')} />}
    <span className="absolute left-0 top-[64vh] hidden h-px w-[38vw] bg-ink/10 lg:block" />
    <span className="absolute right-[8vw] top-[12vh] hidden h-[26vh] w-px bg-ink/10 lg:block" />
    <PlusMark className="absolute right-[12vw] top-[78vh] hidden h-3 w-3 opacity-25 md:block" />
    <PlusMark variant="outline" className="absolute left-[46vw] top-[9vh] hidden h-4 w-4 text-ink opacity-25 lg:block" />
    <span className="absolute bottom-[10vh] right-[34vw] hidden h-2 w-2 rounded-full bg-accent-red/60 lg:block" />
  </div>;
}

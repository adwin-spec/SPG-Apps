import { PlusMark } from '@/components/branding/plus-mark';
import { cn } from '@/lib/utils';

/** Keadaan kosong: plus besar sebagai ilustrasi, bukan kartun. */
export function EmptyState({ title = 'Belum ada data', hint, className, compact }: { title?: string; hint?: React.ReactNode; className?: string; compact?: boolean }) {
  return <div className={cn('relative flex flex-col items-center justify-center overflow-hidden text-center', compact ? 'py-6' : 'py-12', className)}>
    <PlusMark variant="outline" className={cn('text-ink opacity-[0.12]', compact ? 'h-10 w-10' : 'h-20 w-20')} />
    <p className={cn('font-semibold text-ink', compact ? 'mt-2 text-sm' : 'mt-4 text-base')}>{title}</p>
    {hint && <p className="mt-1 max-w-sm text-sm text-ink-muted">{hint}</p>}
  </div>;
}

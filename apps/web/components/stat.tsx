import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/card';

/** KPI tile / hero number – a single headline is a stat, not a chart. */
export function Stat({ label, value, sub, delta, hint, loading, className, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number | null; hint?: string; loading?: boolean; className?: string; href?: string }) {
  const body = <>
    <div className="flex items-center gap-1 text-xs font-medium text-ink-secondary">{label}{hint && <span title={hint}><Info className="h-3 w-3 text-ink-muted" aria-label={hint} /></span>}</div>
    {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <div className="num mt-1 text-2xl font-semibold leading-tight text-ink">{value}</div>}
    <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
      {delta != null && <span className={cn('inline-flex items-center gap-0.5 font-medium', delta >= 0 ? 'text-good-text' : 'text-critical-text')}>
        {delta >= 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}{Math.abs(delta).toFixed(1)}</span>}
      {sub}
    </div>
  </>;
  const cls = cn('block min-w-0 bg-white px-4 py-3', href && 'hover:bg-surface', className);
  return href ? <a href={href} className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}

/** Row of stats sharing borders (high density, not a pile of floating cards). */
export function StatRow({ children, cols = 6 }: { children: React.ReactNode; cols?: number }) {
  const grid = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }[cols] ?? 'lg:grid-cols-6';
  return <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3', grid)}>{children}</div>;
}

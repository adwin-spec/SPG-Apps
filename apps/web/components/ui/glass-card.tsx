import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassContainer } from './glass-container';

/** Kartu KPI: label ringkas, angka besar hitam, indikator tren, grafik mini. `featured` = dark glass (maks. satu per baris). */
export function KpiCard({ label, value, detail, delta, spark, featured, className }: {
  label: string; value: string; detail?: string; delta?: { pct: number; label: string } | null; spark?: React.ReactNode; featured?: boolean; className?: string;
}) {
  const up = (delta?.pct ?? 0) >= 0;
  return <GlassContainer level={featured ? 'dark' : 'primary'} interactive className={cn('enter relative min-w-0 overflow-hidden px-4 py-4', className)}>
    <div className={cn('text-xs font-medium', featured ? 'text-white/70' : 'text-ink-muted')}>{label}</div>
    <div className={cn('mt-1.5 text-[30px] font-bold leading-none tracking-tight', featured ? 'text-white' : 'text-ink')}>{value}</div>
    {detail && <div className={cn('mt-1.5 text-xs', featured ? 'text-white/65' : 'text-ink-muted')}>{detail}</div>}
    <div className="mt-2 flex items-end justify-between gap-2">
      {delta ? <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold',
        featured ? 'bg-white/10 text-white' : up ? 'bg-good-soft text-good-text' : 'bg-critical-soft text-critical-text')}>
        {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}{up ? '+' : '−'}{Math.abs(delta.pct)}% <span className="font-normal opacity-80">{delta.label}</span></span> : <span />}
      {spark}
    </div>
  </GlassContainer>;
}

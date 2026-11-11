import { cn } from '@/lib/utils';
import { GlassContainer, type GlassLevel } from './glass-container';

/** Panel berjudul (grafik, tabel, formulir). */
export function GlassPanel({ title, subtitle, actions, children, className, bodyClassName, level = 'primary', interactive }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; level?: GlassLevel; interactive?: boolean;
}) {
  const dark = level === 'dark';
  return <GlassContainer as="section" level={level} interactive={interactive} className={cn('enter min-w-0 overflow-hidden', className)}>
    {(title || actions) && <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
      <div className="min-w-0">{title && <h2 className={cn('text-[15px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink')}>{title}</h2>}
        {subtitle && <p className={cn('mt-0.5 text-xs', dark ? 'text-white/65' : 'text-ink-muted')}>{subtitle}</p>}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>}
    <div className={cn('px-5 pb-5 pt-3', bodyClassName)}>{children}</div>
  </GlassContainer>;
}

import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { GlassContainer } from './glass-container';

/** Kompatibilitas: Panel = glass container. Gunakan GlassPanel untuk panel baru. */
export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <GlassContainer as="section" className={cn('enter overflow-hidden', className)} {...p} />; }
export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-start justify-between gap-3 px-5 pb-1 pt-4', className)}>
    <div className="min-w-0"><h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>;
}
export function PanelBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('px-5 pb-5 pt-3', className)} {...p} />; }
export { PageHeader } from '@/components/layout/page-container';
export function Skeleton({ className }: { className?: string }) { return <div className={cn('shimmer rounded-glass-md', className)} />; }
export function Empty({ title, hint }: { title?: string; hint?: string }) { return <EmptyState title={title} hint={hint} compact />; }
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
  return <div role="alert" className="rounded-glass-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm font-medium text-critical-text">{msg}</div>;
}

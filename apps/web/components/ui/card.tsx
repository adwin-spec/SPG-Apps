import { Marker } from '@/components/brand';
import { cn } from '@/lib/utils';

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-md border-2 border-ink bg-paper-card shadow-hard', className)} {...p} />;
}
export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-start justify-between gap-3 border-b-2 border-ink px-4 py-3', className)}>
    <div className="min-w-0"><h2 className="text-sm font-bold uppercase tracking-wide text-ink">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>;
}
export function PanelBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...p} />;
}
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><Marker className="text-2xl text-ink sm:text-3xl">{title}</Marker>{description && <p className="mt-2 max-w-3xl text-sm text-ink-secondary">{description}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-paper-deep', className)} />;
}
export function Empty({ title = 'Belum ada data', hint }: { title?: string; hint?: string }) {
  return <div className="flex flex-col items-center justify-center py-10 text-center"><p className="text-sm font-medium text-ink-secondary">{title}</p>{hint && <p className="mt-1 max-w-sm text-xs text-ink-muted">{hint}</p>}</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
  return <div role="alert" className="rounded-md border-2 border-tt bg-tt-soft px-3 py-2 text-sm font-medium text-tt-dark">{msg}</div>;
}

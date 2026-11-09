import { cn } from '@/lib/utils';

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-lg border border-border bg-white', className)} {...p} />;
}
export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3', className)}>
    <div className="min-w-0"><h2 className="text-sm font-semibold text-ink">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>;
}
export function PanelBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...p} />;
}
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-xl font-semibold text-ink">{title}</h1>{description && <p className="mt-0.5 text-sm text-ink-secondary">{description}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-200/70', className)} />;
}
export function Empty({ title = 'No data', hint }: { title?: string; hint?: string }) {
  return <div className="flex flex-col items-center justify-center py-10 text-center"><p className="text-sm font-medium text-ink-secondary">{title}</p>{hint && <p className="mt-1 max-w-sm text-xs text-ink-muted">{hint}</p>}</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return <div role="alert" className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical-text">{msg}</div>;
}

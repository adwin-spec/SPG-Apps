'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Modal: frosted glass, latar gelap halus, hirarki aksi jelas (footer kanan). */
export function GlassModal({ open, onOpenChange, title, description, children, footer, size = 'md' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return <D.Root open={open} onOpenChange={onOpenChange}><D.Portal>
    <D.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px] data-[state=open]:animate-[tt-enter_200ms_ease-out]" />
    <D.Content className={cn('glass-elevated fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col', w)}>
      <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-5">
        <div><D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>{description && <D.Description className="mt-1 text-sm text-ink-muted">{description}</D.Description>}</div>
        <D.Close className="rounded-full p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink" aria-label="Tutup"><X className="h-4 w-4" /></D.Close></div>
      <div className="overflow-y-auto px-6 py-3">{children}</div>
      {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
    </D.Content></D.Portal></D.Root>;
}

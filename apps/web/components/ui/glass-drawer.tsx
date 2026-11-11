'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Laci samping (detail laporan, filter lanjutan). Penuh lebar di HP. */
export function GlassDrawer({ open, onOpenChange, title, description, children, footer, width = 'max-w-3xl' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; width?: string;
}) {
  return <D.Root open={open} onOpenChange={onOpenChange}><D.Portal>
    <D.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" />
    <D.Content className={cn('glass-elevated fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] flex-col !rounded-glass data-[state=open]:animate-[tt-enter_240ms_ease-out]', width)}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0"><D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>{description && <D.Description className="mt-0.5 text-sm text-ink-muted">{description}</D.Description>}</div>
        <D.Close className="rounded-full p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink" aria-label="Tutup"><X className="h-4 w-4" /></D.Close></div>
      <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
    </D.Content></D.Portal></D.Root>;
}

'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return <D.Root open={open} onOpenChange={onOpenChange}>
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-navy-950/40" />
      <D.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-xl', w)}>
        <div className="flex items-start justify-between border-b border-border px-5 py-3.5">
          <div><D.Title className="text-base font-semibold">{title}</D.Title>{description && <D.Description className="mt-0.5 text-sm text-ink-secondary">{description}</D.Description>}</div>
          <D.Close className="rounded p-1 text-ink-muted hover:bg-surface" aria-label="Close"><X className="h-4 w-4" /></D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  </D.Root>;
}

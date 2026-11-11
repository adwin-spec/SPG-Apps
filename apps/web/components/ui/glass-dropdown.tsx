'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton, type GlassButtonProps } from './glass-button';

export interface DropItem { label: string; hint?: string; icon?: React.ReactNode; onSelect: () => void }
/** Menu tarik-turun: panel elevated glass, navigasi panah/Escape, tutup saat klik di luar. */
export function GlassDropdown({ label, items, icon, variant = 'secondary', align = 'right', loading }: { label: string; items: DropItem[]; icon?: React.ReactNode; variant?: GlassButtonProps['variant']; align?: 'left' | 'right'; loading?: boolean }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off); list.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const key = (e: React.KeyboardEvent) => {
    const btns = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]; const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
  };
  return <div ref={ref} className="relative" onKeyDown={key}>
    <GlassButton variant={variant} aria-haspopup="menu" aria-expanded={open} loading={loading} onClick={() => setOpen((o) => !o)}>{icon}{label}<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /></GlassButton>
    {open && <div ref={list} role="menu" className={cn('glass-elevated enter absolute z-30 mt-2 w-72 p-1.5', align === 'right' ? 'right-0' : 'left-0')}>
      {items.map((it) => <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.onSelect(); }}
        className="flex w-full items-start gap-2.5 rounded-glass-sm px-3 py-2.5 text-left hover:bg-black/[.05] focus:bg-black/[.05] focus:outline-none">
        {it.icon && <span className="mt-0.5 text-ink-secondary">{it.icon}</span>}<span><span className="block text-sm font-semibold">{it.label}</span>{it.hint && <span className="block text-xs text-ink-muted">{it.hint}</span>}</span></button>)}
    </div>}
  </div>;
}

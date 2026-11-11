'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { PlusMark } from '@/components/branding/plus-mark';
import type { BgPreset } from '@/components/branding/typography-background';
import { cn } from '@/lib/utils';

/** Halaman memilih kata-kata latarnya sendiri (mis. dashboard Grosir → MARKET, MOVEMENT, PASAR). */
const BgCtx = createContext<{ preset: BgPreset; setPreset: (p: BgPreset) => void }>({ preset: 'dashboard', setPreset: () => undefined });
export function BackgroundProvider({ children, initial = 'dashboard' }: { children: React.ReactNode; initial?: BgPreset }) {
  const [preset, setPreset] = useState<BgPreset>(initial);
  return <BgCtx.Provider value={{ preset, setPreset }}>{children}</BgCtx.Provider>;
}
export const useBackgroundPreset = () => useContext(BgCtx).preset;
export function useBackground(preset: BgPreset) { const { setPreset } = useContext(BgCtx); useEffect(() => setPreset(preset), [preset, setPreset]); }

export function PageContainer({ preset, children, className }: { preset: BgPreset; children: React.ReactNode; className?: string }) {
  useBackground(preset);
  return <div className={cn('relative', className)}>{children}</div>;
}

/** Judul halaman: label kecil + judul tebal (sans) + keterangan; aksi di kanan. */
export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  // relative z-30: menu di area aksi (mis. Unduh Excel) harus tampil di atas panel filter di bawahnya
  return <div className="enter relative z-30 mb-6 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.2em] text-ink-muted"><PlusMark className="h-2.5 w-2.5" />{eyebrow}</div>}
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[34px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-3xl text-sm text-ink-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

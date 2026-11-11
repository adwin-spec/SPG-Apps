'use client';
import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { BrandLogo, PlusMark } from '@/components/branding/plus-mark';
import { NAV } from '@/lib/nav';
import type { AuthUser } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Sidebar kaca terang: logo plus, ikon monokrom, item aktif berlatar hitam, bisa diciutkan. */
export function AppSidebar({ user, pathname, collapsed, onToggle, mobile }: { user: AuthUser; pathname: string; collapsed: boolean; onToggle?: () => void; mobile?: boolean }) {
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const c = collapsed && !mobile;
  return <nav aria-label="Menu utama" className={cn('glass flex h-full flex-col !rounded-glass p-3', c ? 'items-center' : '')}>
    <div className={cn('flex items-center px-1 pb-5 pt-2', c ? 'justify-center' : 'justify-between')}><BrandLogo collapsed={c} /></div>
    <ul className="flex w-full flex-1 flex-col gap-1">{items.map((n) => {
      const on = pathname === n.href || pathname.startsWith(n.href + '/');
      return <li key={n.href}><Link href={n.href} aria-current={on ? 'page' : undefined} title={c ? n.label : undefined}
        className={cn('flex items-center gap-3 rounded-glass-sm px-3 py-2.5 text-sm font-medium transition-colors duration-200', c && 'justify-center px-0',
          on ? 'bg-ink text-white shadow-[0_6px_16px_rgba(0,0,0,.18)]' : 'text-ink-secondary hover:bg-black/[.05] hover:text-ink')}>
        <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />{!c && <span>{n.label}</span>}{c && <span className="sr-only">{n.label}</span>}</Link></li>; })}</ul>
    {user.role === 'SPV' && !c && <div className="glass-nested mb-2 w-full px-3 py-2.5 text-2xs text-ink-muted"><div className="mb-1 font-semibold uppercase tracking-wider text-ink">Wilayah Anda</div>{user.coverage.map((x) => x.label).join(', ') || 'Belum ditetapkan admin pusat'}</div>}
    {!mobile && onToggle && <button onClick={onToggle} className={cn('flex items-center gap-2 rounded-glass-sm px-3 py-2 text-xs font-medium text-ink-muted hover:bg-black/[.05] hover:text-ink', c && 'justify-center px-0')}
      aria-label={c ? 'Lebarkan menu' : 'Ciutkan menu'}>{c ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" />Ciutkan</>}</button>}
    {!c && <div className="mt-2 flex items-center gap-1.5 px-3 text-2xs text-ink-muted"><PlusMark className="h-2.5 w-2.5" />setiap laporan, satu langkah lebih dekat</div>}
  </nav>;
}

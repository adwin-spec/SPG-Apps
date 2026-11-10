'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { ROLE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ManagementShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); else if (!loading && user?.role === 'SPG') router.replace('/m'); }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  if (loading || !user || user.role === 'SPG') return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const sidebar = <nav aria-label="Menu utama" className="flex h-full flex-col bg-navy-900 text-slate-300">
    <div className="flex h-14 items-center gap-2 border-b border-navy-800 px-4"><div className="flex h-7 w-7 items-center justify-center rounded bg-tt text-sm font-bold text-white">T+</div>
      <div className="leading-tight"><div className="text-sm font-semibold text-white">Tanda Tambah</div><div className="text-2xs text-slate-400">SPG Grosir · Reguler · HORECA</div></div></div>
    <ul className="flex-1 overflow-y-auto px-2 py-3">{items.map((n) => {
      const on = pathname === n.href || pathname.startsWith(n.href + '/');
      return <li key={n.href} className="mb-0.5"><Link href={n.href} aria-current={on ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-navy-800 hover:text-white', on && 'bg-navy-800 text-white')}>
        <n.icon className="h-4 w-4 shrink-0" aria-hidden />{n.label}</Link></li>; })}</ul>
    {user.role === 'SPV' && <div className="border-t border-navy-800 px-4 py-3 text-2xs text-slate-400"><div className="mb-1 font-semibold text-slate-300">Wilayah Anda</div>{user.coverage.map((c) => c.label).join(', ') || 'Belum ditetapkan admin pusat'}</div>}
  </nav>;
  return <div className="min-h-screen lg:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside></div>}
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-white/95 px-4 backdrop-blur">
      <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Buka menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      <div className="ml-auto flex items-center gap-2">
        <div className="text-right leading-tight"><div className="text-sm font-medium">{user.name}</div><div className="text-2xs text-ink-muted">{ROLE_LABEL[user.role]}</div></div>
        <button onClick={logout} className="rounded-md p-2 text-ink-secondary hover:bg-surface" aria-label="Keluar" title="Keluar"><LogOut className="h-5 w-5" /></button>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</main>
  </div>;
}

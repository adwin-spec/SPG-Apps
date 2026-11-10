'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { ROLE_LABEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Brush, Logo } from '@/components/brand';

export function ManagementShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); else if (!loading && user?.role === 'SPG') router.replace('/m'); }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  if (loading || !user || user.role === 'SPG') return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const sidebar = <nav aria-label="Menu utama" className="flex h-full flex-col bg-ink text-paper-deep">
    <div className="flex items-center gap-2.5 px-4 pb-4 pt-5"><Logo className="h-11 w-11 shrink-0" />
      <div className="leading-none"><div className="font-marker text-xl text-paper-card">Tanda Tambah</div><div className="mt-1 text-2xs uppercase tracking-[0.2em] text-comp">SPG · lapangan</div></div></div>
    <ul className="flex-1 overflow-y-auto px-3 py-2">{items.map((n) => {
      const on = pathname === n.href || pathname.startsWith(n.href + '/');
      return <li key={n.href} className="mb-1"><Link href={n.href} aria-current={on ? 'page' : undefined}
        className={cn('group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors', on ? 'text-paper-card' : 'text-comp-light hover:text-paper-card')}>
        {on && <Brush className="absolute inset-0 h-full w-full opacity-100" />}
        <n.icon className="relative h-4 w-4 shrink-0" aria-hidden /><span className="relative">{n.label}</span></Link></li>; })}</ul>
    {user.role === 'SPV' && <div className="mx-3 mb-3 rounded-md border border-dashed border-ink-secondary px-3 py-2 text-2xs text-comp-light"><div className="mb-1 font-bold uppercase tracking-wider text-paper-card">Wilayah Anda</div>{user.coverage.map((c) => c.label).join(', ') || 'Belum ditetapkan admin pusat'}</div>}
    <div className="px-4 pb-4 text-2xs text-ink-secondary">+ setiap laporan, satu langkah lebih dekat</div>
  </nav>;
  return <div className="min-h-screen lg:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r-2 border-ink lg:block">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside></div>}
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b-2 border-ink bg-paper/95 px-4 backdrop-blur">
      <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Buka menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      <div className="ml-auto flex items-center gap-2">
        <div className="text-right leading-tight"><div className="text-sm font-bold">{user.name}</div><div className="text-2xs uppercase tracking-wider text-tt">{ROLE_LABEL[user.role]}</div></div>
        <button onClick={logout} className="rounded-md border-2 border-transparent p-2 text-ink hover:border-ink" aria-label="Keluar" title="Keluar"><LogOut className="h-5 w-5" /></button>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{children}</main>
  </div>;
}

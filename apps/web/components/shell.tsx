'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, X, Smartphone } from 'lucide-react';
import { ROLE_LABELS, MANAGEMENT_ROLES, type RoleCode } from '@tanda/shared';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '@/lib/format';

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const count = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ unread: number }>('/notifications/unread-count'), refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ['notif-list'], queryFn: () => api<{ id: string; title: string; body?: string; severity: string; link?: string; readAt?: string; createdAt: string }[]>('/notifications'), enabled: open });
  const markAll = async () => { await api('/notifications/read', { method: 'POST', body: {} }); count.refetch(); list.refetch(); };
  return <div className="relative">
    <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-ink-secondary hover:bg-surface" aria-label={`Notifications (${count.data?.unread ?? 0} unread)`}>
      <Bell className="h-5 w-5" />{!!count.data?.unread && <span className="num absolute right-1 top-1 rounded-full bg-critical px-1 text-[10px] font-semibold leading-4 text-white">{count.data.unread > 99 ? '99+' : count.data.unread}</span>}
    </button>
    {open && <div className="absolute right-0 z-40 mt-1 w-[min(92vw,380px)] rounded-lg border border-border bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2"><span className="text-sm font-semibold">Notifications</span><button className="text-xs text-primary hover:underline" onClick={markAll}>Mark all read</button></div>
      <ul className="max-h-96 overflow-y-auto">{(list.data ?? []).map((n) => <li key={n.id} className={cn('border-b border-border px-3 py-2 text-sm', !n.readAt && 'bg-primary-soft/50')}>
        <a href={n.link ?? '#'} className="block hover:underline"><span className={cn('mr-1 text-2xs font-semibold uppercase', n.severity === 'CRITICAL' ? 'text-critical-text' : n.severity === 'WARNING' ? 'text-warn-text' : 'text-primary')}>{n.severity}</span>{n.title}</a>
        <div className="text-2xs text-ink-muted">{fmtDateTime(n.createdAt)}</div></li>)}
        {list.data?.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">You're all caught up.</li>}</ul>
    </div>}
  </div>;
}

export function ManagementShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, canAny, isSpg } = useAuth();
  const pathname = usePathname(); const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isManager = !!user && user.roles.some((r) => (MANAGEMENT_ROLES as string[]).includes(r));
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); else if (!loading && user && !isManager && isSpg) router.replace('/m'); }, [loading, user, isManager, isSpg, router, pathname]);
  useEffect(() => setMobileOpen(false), [pathname]);
  if (loading || !user || !isManager) return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Loading…</div>;
  const items = NAV.filter((n) => canAny(...n.any));
  const active = (href: string) => pathname === href || (href !== '/overview' && pathname.startsWith(href + '/')) || (href === '/overview' && pathname === '/overview');
  const sidebar = <nav aria-label="Main" className="flex h-full flex-col bg-navy-900 text-slate-300">
    <div className="flex h-14 items-center gap-2 border-b border-navy-800 px-4"><div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-sm font-bold text-white">T+</div>
      <div className="leading-tight"><div className="text-sm font-semibold text-white">Tanda Tambah</div><div className="text-2xs text-slate-400">SPG Performance & MI</div></div></div>
    <ul className="flex-1 overflow-y-auto px-2 py-3">{items.map((n) => {
      const open = pathname === n.href || pathname.startsWith(n.href + '/') || n.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + '/'));
      const kids = n.children?.filter((c) => canAny(...c.any)) ?? [];
      return <li key={n.href} className="mb-0.5">
        <Link href={kids[0]?.href ?? n.href} className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-navy-800 hover:text-white', open && 'bg-navy-800 text-white')}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden />{n.label}</Link>
        {open && kids.length > 1 && <ul className="ml-6 mt-0.5 border-l border-navy-700 pl-2">{kids.map((c) => <li key={c.href}>
          <Link href={c.href} aria-current={active(c.href) ? 'page' : undefined} className={cn('block rounded px-2 py-1.5 text-xs hover:text-white', active(c.href) ? 'font-medium text-white' : 'text-slate-400')}>{c.label}</Link></li>)}</ul>}
      </li>; })}</ul>
    {isSpg && <Link href="/m" className="mx-2 mb-2 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-slate-400 hover:bg-navy-800 hover:text-white"><Smartphone className="h-4 w-4" />SPG mobile app</Link>}
  </nav>;
  return <div className="min-h-screen lg:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside></div>}
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-white/95 px-4 backdrop-blur">
      <button className="rounded-md p-2 lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle navigation">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      <div className="ml-auto flex items-center gap-1">
        <NotificationsBell />
        <div className="hidden text-right leading-tight sm:block"><div className="text-sm font-medium">{user.fullName}</div><div className="text-2xs text-ink-muted">{user.roles.map((r) => ROLE_LABELS[r as RoleCode] ?? r).join(', ')}</div></div>
        <button onClick={logout} className="rounded-md p-2 text-ink-secondary hover:bg-surface" aria-label="Log out" title="Log out"><LogOut className="h-5 w-5" /></button>
      </div>
    </header>
    <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">{children}</main>
  </div>;
}

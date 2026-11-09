'use client';
import { useRouter } from 'next/navigation';
import { ScreenLink, useScreen, type Screen } from './nav';
import { useEffect } from 'react';
import { Home, MapPin, FileText, Gauge, RefreshCw, WifiOff, CloudUpload, AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useOnline, useOutbox } from '@/lib/offline/use-outbox';

import { cn } from '@/lib/utils';
import { FieldProvider } from './field-state';

const TABS: { to: Screen; label: string; icon: React.ElementType }[] = [{ to: 'today', label: 'Today', icon: Home }, { to: 'outlets', label: 'Outlets', icon: MapPin }, { to: 'reports', label: 'Report', icon: FileText }, { to: 'performance', label: 'My KPI', icon: Gauge }];

function SyncPill() {
  const online = useOnline(); const { pending, problems } = useOutbox();
  return <ScreenLink to="sync" className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
    !online ? 'bg-warn-soft text-warn-text' : problems ? 'bg-critical-soft text-critical-text' : pending ? 'bg-primary-soft text-primary' : 'bg-good-soft text-good-text')}
    aria-label={`Sync status: ${!online ? 'offline' : problems ? `${problems} need attention` : pending ? `${pending} pending` : 'all synced'}`}>
    {!online ? <><WifiOff className="h-3.5 w-3.5" />Offline{pending ? ` · ${pending}` : ''}</> : problems ? <><AlertTriangle className="h-3.5 w-3.5" />{problems} need action</>
      : pending ? <><CloudUpload className="h-3.5 w-3.5" />{pending} syncing</> : <><RefreshCw className="h-3.5 w-3.5" />Synced</>}
  </ScreenLink>;
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const { user, loading, isSpg, offline, logout } = useAuth(); const router = useRouter(); const { screen } = useScreen();
  useEffect(() => { if (!loading && !user) router.replace('/login?next=/m'); else if (!loading && user && !isSpg) router.replace('/overview'); }, [loading, user, isSpg, router]);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  if (loading || !user || !isSpg) return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Loading…</div>;
  return <FieldProvider>
    <div className="mx-auto min-h-screen max-w-lg bg-surface pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-navy-900 px-4 py-3 text-white">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{user.fullName}</div><div className="text-2xs text-slate-300">SPG {user.spgCategory}{offline ? ' · offline session' : ''}</div></div>
        <div className="flex items-center gap-2"><SyncPill /><button onClick={logout} aria-label="Log out" className="rounded p-1.5 text-slate-300"><LogOut className="h-4 w-4" /></button></div>
      </header>
      <main className="px-3 py-3">{children}</main>
      <nav aria-label="SPG" className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => { const active = screen === t.to || (t.to === 'outlets' && screen === 'visit');
          return <ScreenLink key={t.to} to={t.to} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-2xs font-medium', active ? 'text-primary' : 'text-ink-muted')}>
            <t.icon className="h-5 w-5" aria-hidden />{t.label}</ScreenLink>; })}
      </nav>
    </div>
  </FieldProvider>;
}

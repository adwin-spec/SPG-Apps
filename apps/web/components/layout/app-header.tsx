'use client';
import { LogOut, Menu } from 'lucide-react';
import { ROLE_LABEL, type AuthUser } from '@/lib/types';

export function AppHeader({ user, onMenu, onLogout }: { user: AuthUser; onMenu: () => void; onLogout: () => void }) {
  return <header className="sticky top-3 z-30 mx-3 mt-3 flex h-14 items-center gap-2 rounded-glass-md border border-white/80 bg-white/60 px-3 shadow-glass backdrop-blur-xl lg:mx-0 lg:mr-3">
    <button className="rounded-full p-2 hover:bg-black/5 lg:hidden" onClick={onMenu} aria-label="Buka menu"><Menu className="h-5 w-5" /></button>
    <div className="ml-auto flex items-center gap-3">
      <div className="text-right leading-tight"><div className="text-sm font-semibold">{user.name}</div><div className="text-2xs text-ink-muted">{ROLE_LABEL[user.role]}</div></div>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>{user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
      <button onClick={onLogout} className="rounded-full p-2 text-ink-secondary hover:bg-black/5 hover:text-ink" aria-label="Keluar" title="Keluar"><LogOut className="h-5 w-5" /></button>
    </div>
  </header>;
}

'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, refreshSession, setAccessToken, setUnauthenticatedHandler } from './api';
import type { AuthUser } from './types';

/** Profil SPG (tanpa token) disimpan agar aplikasi HP tetap terbuka saat offline. */
const PROFILE = 'tt_profile';
const remember = (u: AuthUser | null) => { try { if (u?.role === 'SPG') localStorage.setItem(PROFILE, JSON.stringify(u)); else localStorage.removeItem(PROFILE); } catch { /* storage diblokir */ } };

interface AuthState { user: AuthUser | null; loading: boolean; offline: boolean; login: (u: string, p: string) => Promise<AuthUser>; logout: () => Promise<void>; refresh: () => Promise<void> }
const Ctx = createContext<AuthState | null>(null);

export const homeFor = (u: AuthUser) => (u.role === 'SPG' ? '/m' : '/dashboard');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => { const r = await refreshSession(); if (r) { setUser(r.user); setOffline(false); remember(r.user); } }, []);
  useEffect(() => {
    setUnauthenticatedHandler(() => { setUser(null); setAccessToken(null); router.replace('/login'); });
    refreshSession()
      .then((r) => { setUser(r?.user ?? null); remember(r?.user ?? null); })
      .catch(() => { try { const c = localStorage.getItem(PROFILE); if (c) { setUser(JSON.parse(c)); setOffline(true); } } catch { /* abaikan */ } })
      .finally(() => setLoading(false));
    const t = setInterval(() => { refresh().catch(() => undefined); }, 12 * 60 * 1000);
    const back = () => { refresh().catch(() => undefined); };
    window.addEventListener('online', back);
    return () => { clearInterval(t); window.removeEventListener('online', back); };
  }, [router, refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ accessToken: string; user: AuthUser }>('/auth/login', { method: 'POST', body: { username, password } });
    setAccessToken(r.accessToken); setUser(r.user); setOffline(false); remember(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null); setUser(null); remember(null);
    try { Object.keys(localStorage).filter((k) => k.startsWith('tt_')).forEach((k) => localStorage.removeItem(k)); } catch { /* abaikan */ }
    router.replace('/login');
  }, [router]);

  const value = useMemo(() => ({ user, loading, offline, login, logout, refresh }), [user, loading, offline, login, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() { const c = useContext(Ctx); if (!c) throw new Error('useAuth di luar AuthProvider'); return c; }

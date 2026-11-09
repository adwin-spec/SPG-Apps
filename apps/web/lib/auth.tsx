'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SPG_ROLES, type AuthUser, type PermissionCode } from '@tanda/shared';
import { api, refreshSession, setAccessToken, setUnauthenticatedHandler } from './api';
import { cacheGet, cacheSet } from './offline/db';

/** Only the non-secret profile of SPG users is cached so the field app can reopen offline; tokens never are. */
const rememberProfile = (u: AuthUser | null | undefined) => { if (u?.spgId) void cacheSet('profile', u).catch(() => undefined); };

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (...perms: PermissionCode[]) => boolean;
  canAny: (...perms: PermissionCode[]) => boolean;
  isSpg: boolean;
  /** true when running from the cached profile without a server session (offline). */
  offline: boolean;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUnauthenticatedHandler(() => { setUser(null); setAccessToken(null); router.replace('/login'); });
    refreshSession()
      .then((r) => { setUser(r?.user ?? null); rememberProfile(r?.user); })
      .catch(async () => {
        // Network failure (offline): reopen with the cached SPG profile; queued work syncs once a session is restored.
        const cached = await cacheGet<AuthUser>('profile').catch(() => null);
        setUser(cached?.value ?? null); setOffline(!!cached);
      })
      .finally(() => setLoading(false));
    // Proactive refresh before the 15-minute access token expires.
    const t = setInterval(() => { refreshSession().then((r) => { if (r) { setUser(r.user); setOffline(false); } }).catch(() => undefined); }, 12 * 60 * 1000);
    const back = () => { refreshSession().then((r) => { if (r) { setUser(r.user); setOffline(false); } }).catch(() => undefined); };
    window.addEventListener('online', back);
    return () => { clearInterval(t); window.removeEventListener('online', back); };
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ accessToken: string; user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(r.accessToken); setUser(r.user); setOffline(false); rememberProfile(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null); setUser(null); void cacheSet('profile', null).catch(() => undefined); router.replace('/login');
  }, [router]);

  const value = useMemo<AuthState>(() => ({
    user, loading, login, logout, offline,
    can: (...p) => !!user && p.every((x) => user.permissions.includes(x)),
    canAny: (...p) => !!user && p.some((x) => user.permissions.includes(x)),
    isSpg: !!user && user.roles.some((r) => (SPG_ROLES as string[]).includes(r)) && !!user.spgId,
  }), [user, loading, login, logout, offline]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SPG_ROLES, type AuthUser, type PermissionCode } from '@tanda/shared';
import { api, refreshSession, setAccessToken, setUnauthenticatedHandler } from './api';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (...perms: PermissionCode[]) => boolean;
  canAny: (...perms: PermissionCode[]) => boolean;
  isSpg: boolean;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setUnauthenticatedHandler(() => { setUser(null); setAccessToken(null); router.replace('/login'); });
    refreshSession().then((r) => setUser(r?.user ?? null)).catch(() => setUser(null)).finally(() => setLoading(false));
    // Proactive refresh before the 15-minute access token expires.
    const t = setInterval(() => { refreshSession().then((r) => r && setUser(r.user)).catch(() => undefined); }, 12 * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ accessToken: string; user: AuthUser }>('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(r.accessToken); setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null); setUser(null); router.replace('/login');
  }, [router]);

  const value = useMemo<AuthState>(() => ({
    user, loading, login, logout,
    can: (...p) => !!user && p.every((x) => user.permissions.includes(x)),
    canAny: (...p) => !!user && p.some((x) => user.permissions.includes(x)),
    isSpg: !!user && user.roles.some((r) => (SPG_ROLES as string[]).includes(r)) && !!user.spgId,
  }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

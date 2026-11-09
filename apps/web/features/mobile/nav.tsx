'use client';
import { useSearchParams } from 'next/navigation';

/**
 * The SPG app is a single route (/m) with client-side screens. Switching screens uses history.pushState,
 * which Next.js integrates with useSearchParams WITHOUT a server round-trip – so navigation works offline.
 */
export type Screen = 'today' | 'outlets' | 'visit' | 'reports' | 'performance' | 'sync';
export function go(screen: Screen, params: Record<string, string> = {}) {
  const p = new URLSearchParams({ ...(screen === 'today' ? {} : { s: screen }), ...params });
  const qs = p.toString();
  window.history.pushState(null, '', `/m${qs ? `?${qs}` : ''}`);
  window.scrollTo(0, 0);
}
export function useScreen(): { screen: Screen; params: URLSearchParams } {
  const sp = useSearchParams();
  return { screen: (sp.get('s') as Screen) || 'today', params: sp };
}
export function ScreenLink({ to, params, className, children }: { to: Screen; params?: Record<string, string>; className?: string; children: React.ReactNode }) {
  const qs = new URLSearchParams({ ...(to === 'today' ? {} : { s: to }), ...params }).toString();
  return <a href={`/m${qs ? `?${qs}` : ''}`} className={className} onClick={(e) => { e.preventDefault(); go(to, params); }}>{children}</a>;
}

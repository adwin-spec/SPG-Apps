'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { DecorativeLayer } from '@/components/branding/decorative-layer';
import { PlusLoader } from '@/components/branding/plus-mark';
import { TypographyBackground } from '@/components/branding/typography-background';
import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { BackgroundProvider, useBackgroundPreset } from '@/components/layout/page-container';

/** Lapisan halaman manajemen: dasar putih → teks latar → grafis → kaca (sidebar, panel) → konten. */
export function ManagementShell({ children }: { children: React.ReactNode }) {
  return <BackgroundProvider><ShellInner>{children}</ShellInner></BackgroundProvider>;
}
function Backdrop() { const preset = useBackgroundPreset(); return <><TypographyBackground preset={preset} /><DecorativeLayer /></>; }

function ShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('tt_sidebar') === '1'); } catch { /* abaikan */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('tt_sidebar', c ? '0' : '1'); } catch { /* abaikan */ } return !c; });
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); else if (!loading && user?.role === 'SPG') router.replace('/m'); }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  if (loading || !user || user.role === 'SPG') return <div className="flex h-screen items-center justify-center"><PlusLoader /></div>;
  return <div className={cn('relative min-h-screen transition-[padding] duration-200', collapsed ? 'lg:pl-[96px]' : 'lg:pl-[272px]')}>
    <Backdrop />
    <aside className={cn('fixed inset-y-3 left-3 z-30 hidden transition-[width] duration-200 lg:block', collapsed ? 'w-[72px]' : 'w-[248px]')}>
      <AppSidebar user={user} pathname={pathname} collapsed={collapsed} onToggle={toggle} /></aside>
    {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <aside className="enter absolute inset-y-3 left-3 w-[260px]"><AppSidebar user={user} pathname={pathname} collapsed={false} mobile /></aside></div>}
    <div className="relative z-10"><AppHeader user={user} onMenu={() => setOpen(true)} onLogout={logout} />
      <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:pl-3 lg:pr-6">{children}</main></div>
  </div>;
}

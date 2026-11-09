'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading, isSpg } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading) router.replace(!user ? '/login' : isSpg && !user.permissions.includes('dashboard.read') ? '/m' : '/overview'); }, [user, loading, isSpg, router]);
  return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Loading…</div>;
}

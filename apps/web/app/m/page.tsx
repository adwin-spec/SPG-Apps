'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { FieldApp } from '@/features/field/app';

export default function MobilePage() {
  const { user, loading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace('/login?next=/m'); else if (!loading && user && user.role !== 'SPG') router.replace('/dashboard'); }, [loading, user, router]);
  useEffect(() => { if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined); }, []);
  if (loading || !user || user.role !== 'SPG') return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
  return <FieldApp />;
}

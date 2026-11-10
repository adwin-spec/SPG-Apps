'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading) router.replace(user ? homeFor(user) : '/login'); }, [user, loading, router]);
  return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
}

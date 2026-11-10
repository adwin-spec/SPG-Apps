'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/ui/card';
import { Brush, Logo } from '@/components/brand';

function LoginForm() {
  const { login } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!username || !password) { setError(new Error('Isi username dan password')); return; }
    setBusy(true);
    try { const u = await login(username.trim(), password); router.replace(u.role === 'SPG' ? '/m' : sp.get('next') || homeFor(u)); }
    catch (er) { setError(er); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4" noValidate>
    {!!error && <ErrorBox error={error} />}
    <Field label="Username" htmlFor="username"><Input id="username" className="h-11" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
    <Field label="Password" htmlFor="password"><Input id="password" className="h-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    <Button type="submit" className="w-full" size="lg" loading={busy}>Masuk</Button>
  </form>;
}

export default function LoginPage() {
  return <div className="flex min-h-screen flex-col lg:flex-row">
    <div className="relative flex flex-col justify-between overflow-hidden bg-ink px-6 py-8 text-paper-card lg:w-[46%] lg:p-12">
      {/* tanda "+" raksasa di latar */}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute -right-16 -top-10 h-[130%] opacity-[0.07] lg:-right-24" aria-hidden><path d="M38 0h24v38h38v24H62v38H38V62H0V38h38z" fill="#fffdf8" /></svg>
      <div className="relative flex items-center gap-3"><Logo className="h-12 w-12" /><span className="font-marker text-2xl">Tanda Tambah</span></div>
      <div className="relative my-10 lg:my-0">
        <h1 className="font-marker text-4xl leading-[1.1] lg:text-6xl">Catat di lapangan.<br /><span className="relative inline-block">Lihat hasilnya.<Brush className="absolute -bottom-2 left-0 h-4" /></span></h1>
        <p className="mt-6 max-w-md text-sm text-comp-light">Laporan SPG Grosir, kunjungan outlet Reguler, dan survei HORECA langsung dari HP. Disetujui supervisor wilayah, lalu masuk dashboard.</p>
      </div>
      <p className="relative hidden text-xs uppercase tracking-[0.2em] text-ink-secondary lg:block">Sistem internal · setiap akses tercatat</p>
    </div>
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-md border-2 border-ink bg-paper-card p-6 shadow-hard">
        <h2 className="font-marker text-2xl">Masuk</h2><p className="mb-6 mt-1 text-sm text-ink-secondary">Gunakan akun dari admin pusat.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  </div>;
}

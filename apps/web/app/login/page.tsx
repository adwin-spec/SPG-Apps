'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/ui/card';

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
    <Field label="Username" htmlFor="username"><Input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
    <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    <Button type="submit" className="w-full" size="lg" loading={busy}>Masuk</Button>
  </form>;
}

export default function LoginPage() {
  return <div className="flex min-h-screen">
    <div className="hidden w-[42%] flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
      <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded bg-tt font-bold">T+</div><span className="font-semibold">Tanda Tambah</span></div>
      <div><h1 className="text-3xl font-semibold leading-tight">SPG Performance &amp;<br />Market Intelligence</h1>
        <p className="mt-3 max-w-md text-sm text-slate-300">Laporan SPG Grosir, kunjungan outlet Reguler, dan survei konsumen HORECA langsung dari HP. Disetujui supervisor wilayah, lalu masuk dashboard.</p></div>
      <p className="text-xs text-slate-500">Sistem internal · Setiap akses tercatat</p>
    </div>
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h2 className="mb-1 text-xl font-semibold">Masuk</h2><p className="mb-6 text-sm text-ink-secondary">Gunakan akun dari admin pusat.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  </div>;
}

'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';
import { GlassButton } from '@/components/ui/glass-button';
import { GlassContainer } from '@/components/ui/glass-container';
import { Field, GlassInput } from '@/components/ui/glass-input';
import { ErrorBox } from '@/components/ui/card';
import { BrandLogo, PlusMark } from '@/components/branding/plus-mark';
import { TypographyBackground } from '@/components/branding/typography-background';

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
    <Field label="Username" htmlFor="username"><GlassInput id="username" className="h-11" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
    <Field label="Password" htmlFor="password"><GlassInput id="password" className="h-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    <GlassButton type="submit" className="w-full" size="lg" loading={busy}>Masuk</GlassButton>
  </form>;
}

export default function LoginPage() {
  return <div className="relative min-h-screen overflow-hidden">
    <TypographyBackground preset="login" animate />
    <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-2 lg:gap-14">
      {/* Kiri: komposisi poster – dekorasi tidak pernah berada di bawah teks */}
      <div aria-hidden className="relative hidden h-[560px] lg:block">
        <PlusMark className="absolute left-0 top-6 h-[440px] w-[440px]" />
        <PlusMark variant="glass" className="absolute bottom-0 right-6 h-[220px] w-[220px] drop-shadow-[0_20px_40px_rgba(0,0,0,.12)]" />
        <PlusMark variant="outline" className="absolute right-24 top-0 h-16 w-16 text-ink/30" />
        <span className="absolute bottom-12 left-6 -rotate-6 font-marker text-3xl text-ink/80">+ more growth</span>
      </div>
      {/* Kanan: pesan + formulir */}
      <div className="enter">
        <BrandLogo />
        <h1 className="mt-8 text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-[44px]">Catat di lapangan.<br />Lihat hasilnya.</h1>
        <p className="mt-3 max-w-md text-sm text-ink-muted">Laporan SPG Grosir, kunjungan outlet Reguler, dan survei HORECA langsung dari HP. Disetujui supervisor wilayah, lalu masuk dashboard.</p>
        <GlassContainer level="elevated" className="mt-7 w-full max-w-md p-7">
          <h2 className="text-xl font-bold tracking-tight">Masuk</h2><p className="mb-5 mt-1 text-sm text-ink-muted">Gunakan akun dari admin pusat.</p>
          <Suspense><LoginForm /></Suspense>
          <p className="mt-6 flex items-center gap-1.5 text-2xs uppercase tracking-[0.18em] text-ink-muted"><PlusMark className="h-2.5 w-2.5" />Sistem internal · setiap akses tercatat</p>
        </GlassContainer>
      </div>
    </div>
  </div>;
}

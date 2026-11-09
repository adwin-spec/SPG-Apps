'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@tanda/shared';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/ui/card';

function LoginForm() {
  const { login } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const u = await login(v.email, v.password);
      const spgOnly = !!u.spgId && !u.permissions.includes('dashboard.read');
      router.replace(spgOnly ? '/m' : sp.get('next') || '/overview');
    } catch (e) { setError(e); }
  });
  return <form onSubmit={onSubmit} className="space-y-4" noValidate>
    {!!error && <ErrorBox error={error} />}
    <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}><Input id="email" type="email" autoComplete="username" {...form.register('email')} /></Field>
    <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}><Input id="password" type="password" autoComplete="current-password" {...form.register('password')} /></Field>
    <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>Sign in</Button>
  </form>;
}

export default function LoginPage() {
  return <div className="flex min-h-screen">
    <div className="hidden w-[42%] flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
      <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded bg-primary font-bold">T+</div><span className="font-semibold">Tanda Tambah</span></div>
      <div><h1 className="text-3xl font-semibold leading-tight">SPG Performance &amp;<br />Market Intelligence</h1>
        <p className="mt-3 max-w-md text-sm text-slate-300">One platform for SPG Grosir, HORECA and Reguler: field activity, sales, KPI performance and competitor intelligence – validated, traceable and auditable.</p></div>
      <p className="text-xs text-slate-500">Internal system · Access is logged</p>
    </div>
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h2 className="mb-1 text-xl font-semibold">Sign in</h2><p className="mb-6 text-sm text-ink-secondary">Use your company account.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  </div>;
}

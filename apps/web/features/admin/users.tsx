'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type AuthUser, type ReportType, type Role, ROLE_LABEL, TYPE_LABEL, TYPES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { indexKec, searchKec, shortKab } from '@/features/field/engine';
import { selectCls, useWilayah } from './hooks';

export function UsersView() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users', 'all'], queryFn: () => api<AuthUser[]>('/users') });
  const admin = user?.role === 'ADMIN';
  const call = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast('success', msg); qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); }
  };
  const list = q.data ?? []; const spgs = list.filter((u) => u.role === 'SPG'); const spvs = list.filter((u) => u.role === 'SPV'); const admins = list.filter((u) => u.role === 'ADMIN');
  return <>
    <PageHeader title="SPG & Supervisor" description={admin ? 'Satu SPG bisa memegang beberapa tugas. Laporan diarahkan ke supervisor yang memegang kecamatan lokasinya.' : 'Daftar SPG (hanya baca). Perubahan dilakukan admin pusat.'} />
    <div className="grid gap-4">
      {admin && <NewUser onDone={() => qc.invalidateQueries({ queryKey: ['users'] })} />}
      <Panel><PanelHeader title={`SPG (${spgs.length})`} subtitle={admin ? 'Klik tugas untuk mengubah. SPG memilih tugas saat mulai laporan.' : undefined} />
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-surface text-left text-2xs uppercase text-ink-muted"><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Username</th><th className="px-3 py-2">Tugas</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Status</th>{admin && <th />}</tr></thead>
          <tbody>{spgs.map((u) => <tr key={u.id} className="border-t border-border"><td className="px-3 py-2 font-medium">{u.name}</td><td className="px-3 py-2 text-ink-muted">{u.username}</td>
            <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{TYPES.map((t) => { const on = u.tugas.includes(t);
              return admin ? <button key={t} aria-pressed={on} onClick={() => call(() => api(`/users/${u.id}`, { method: 'PATCH', body: { tugas: on ? u.tugas.filter((x) => x !== t) : [...u.tugas, t] } }), 'Tugas diperbarui')}
                className={cn('h-7 rounded-full border-2 px-2.5 text-xs font-bold', on ? 'border-ink bg-ink text-paper-card' : 'border-ink/40 bg-paper-card')}>{TYPE_LABEL[t]}</button> : on && <Badge key={t}>{TYPE_LABEL[t]}</Badge>; })}</div></td>
            <td className="px-3 py-2">{u.area ?? '–'}</td><td className="px-3 py-2">{u.active ? <Badge tone="good">Aktif</Badge> : <Badge tone="critical">Nonaktif</Badge>}</td>
            {admin && <td className="px-3 py-2"><RowActions u={u} call={call} /></td>}</tr>)}</tbody></table></div></Panel>
      {admin && <Panel><PanelHeader title={`Supervisor & wilayah (${spvs.length})`} subtitle="Wilayah bisa seluruh kab/kota atau per kecamatan. Wilayah yang dilepas tetap tercatat dalam riwayat, jadi persetujuan lama tetap sah." />
        <PanelBody className="grid gap-3">{spvs.map((u) => <SpvBlock key={u.id} u={u} call={call} />)}{!spvs.length && <p className="text-sm text-ink-muted">Belum ada supervisor. Buat akun dengan peran Supervisor di atas.</p>}</PanelBody></Panel>}
      {admin && <Panel><PanelHeader title={`Admin pusat (${admins.length})`} /><PanelBody className="grid gap-2">{admins.map((u) => <div key={u.id} className="flex items-center justify-between text-sm"><span>{u.name} <span className="text-ink-muted">({u.username})</span></span>{u.id !== user?.id && <RowActions u={u} call={call} />}</div>)}</PanelBody></Panel>}
    </div></>;
}

function RowActions({ u, call }: { u: AuthUser; call: (fn: () => Promise<unknown>, m: string) => void }) {
  return <div className="flex gap-1.5">
    <Button size="sm" variant="secondary" onClick={() => { const p = prompt(`Password baru untuk ${u.name} (minimal 8 karakter):`); if (p) call(() => api(`/users/${u.id}`, { method: 'PATCH', body: { password: p } }), 'Password direset'); }}>Reset password</Button>
    <Button size="sm" variant="secondary" className={u.active ? 'text-critical-text' : ''} onClick={() => call(() => api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), u.active ? 'Dinonaktifkan' : 'Diaktifkan')}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</Button></div>;
}

function NewUser({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ username: '', name: '', password: '', role: 'SPG' as Role, tugas: [] as ReportType[], area: '' }); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api('/users', { method: 'POST', body: { ...f, area: f.area || null } }); toast('success', `Akun ${f.name} dibuat`); setF({ username: '', name: '', password: '', role: f.role, tugas: [], area: '' }); onDone(); }
    catch (er) { toast('error', er instanceof ApiError ? er.message : 'Gagal'); } finally { setBusy(false); }
  };
  return <Panel><PanelHeader title="Buat akun" subtitle="Berikan username dan password ke orangnya secara langsung. Password bisa direset kapan saja." />
    <PanelBody><form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
      <Field label="Nama lengkap" htmlFor="nu-name"><Input id="nu-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Username" htmlFor="nu-user" hint="huruf kecil, angka, titik"><Input id="nu-user" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></Field>
      <Field label="Password awal" htmlFor="nu-pass" hint="minimal 8 karakter"><Input id="nu-pass" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Peran" htmlFor="nu-role"><select id="nu-role" className={cn(selectCls, 'w-full')} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(['SPG', 'SPV', 'ADMIN'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      {f.role === 'SPG' && <div><div className="mb-1 text-xs font-medium text-ink-secondary">Tugas</div><div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <label key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm">
        <input type="checkbox" name="nu-tugas" value={t} checked={f.tugas.includes(t)} onChange={(e) => setF({ ...f, tugas: e.target.checked ? [...f.tugas, t] : f.tugas.filter((x) => x !== t) })} />{TYPE_LABEL[t]}</label>)}</div></div>}
      <Field label="Area (keterangan)" htmlFor="nu-area"><Input id="nu-area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
      <div className="md:col-span-3"><Button type="submit" loading={busy}>Buat akun</Button></div>
    </form></PanelBody></Panel>;
}

function SpvBlock({ u, call }: { u: AuthUser; call: (fn: () => Promise<unknown>, m: string) => void }) {
  const wil = useWilayah(); const [term, setTerm] = useState(''); const [kab, setKab] = useState('');
  const ix = wil.data ? indexKec(wil.data) : null; const res = ix ? searchKec(ix, term) : [];
  const provs = [...new Map((wil.data ?? []).map((k) => [k.provKode, k.provinsi])).entries()];
  const add = (level: 'KAB' | 'KEC', kode: string) => call(() => api(`/users/${u.id}/coverage`, { method: 'POST', body: { level, kode } }), 'Wilayah ditambahkan');
  return <div className="grid gap-2 rounded-md border-2 border-ink/30 bg-paper p-3" data-spv={u.username}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{u.name}</b> <span className="text-xs text-ink-muted">{u.username}</span> {u.active ? <Badge tone="good">Aktif</Badge> : <Badge tone="critical">Nonaktif</Badge>}</div><RowActions u={u} call={call} /></div>
    <div className="flex flex-wrap gap-1.5">{u.coverage.map((c) => <span key={c.id} className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper-card py-0.5 pl-2.5 pr-1 text-xs font-semibold">{c.label}
      {u.overlaps?.[c.id] && <span className="text-warn-text" title="Juga dipegang supervisor lain">⚠ juga {u.overlaps[c.id].join(', ')}</span>}
      <button className="grid h-6 w-6 place-items-center rounded-full hover:bg-tt-soft" aria-label={`Lepas ${c.label}`} onClick={() => call(() => api(`/users/${u.id}/coverage/${c.id}`, { method: 'DELETE' }), 'Wilayah dilepas')}><X className="h-3 w-3" /></button></span>)}
      {!u.coverage.length && <span className="text-xs text-ink-muted">Belum ada wilayah – laporan belum diarahkan ke supervisor ini.</span>}</div>
    <div className="flex flex-wrap gap-2"><select aria-label={`Kabupaten/kota untuk ${u.name}`} className={selectCls} value={kab} onChange={(e) => setKab(e.target.value)}><option value="">Pilih kab/kota…</option>
      {provs.map(([pk, pn]) => <optgroup key={pk} label={pn}>{wil.data!.filter((k) => k.provKode === pk).map((k) => <option key={k.kode} value={k.kode}>{shortKab(k.nama)}</option>)}</optgroup>)}</select>
      <Button size="sm" variant="secondary" disabled={!kab} onClick={() => { add('KAB', kab); setKab(''); }}>+ Seluruh kab/kota</Button>
      <input className="h-9 min-w-[14rem] flex-1 rounded-md border border-border px-2.5 text-sm" placeholder="Atau cari kecamatan…" aria-label={`Cari kecamatan untuk ${u.name}`} value={term} onChange={(e) => setTerm(e.target.value)} /></div>
    {!!res.length && <div className="max-h-56 overflow-y-auto rounded-md border border-border">{res.map((c) => <button key={c.kode} className="block w-full border-t border-border px-3 py-1.5 text-left text-sm first:border-t-0 hover:bg-primary-soft" onClick={() => { add('KEC', c.kode); setTerm(''); }}>
      <b>{c.nama}</b> <span className="text-xs text-ink-muted">{shortKab(c.kab)} · {c.prov}</span></button>)}</div>}
  </div>;
}

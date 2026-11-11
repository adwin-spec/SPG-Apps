'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useSettings } from './hooks';
import { PageContainer } from '@/components/layout/page-container';

export function SettingsView() {
  const s = useSettings(); const toast = useToast(); const qc = useQueryClient();
  const [v, setV] = useState({ brand: '', variants: [] as string[], grosirs: [] as string[] }); const [nv, setNv] = useState(''); const [ng, setNg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) setV(s.data); }, [s.data]);
  const save = async (next = v) => {
    setBusy(true);
    try { const r = await api<typeof v>('/settings', { method: 'PUT', body: next }); setV(r); qc.setQueryData(['settings'], r); qc.invalidateQueries({ queryKey: ['forms'] }); toast('success', 'Pengaturan disimpan'); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } finally { setBusy(false); }
  };
  const samples = async (load: boolean) => {
    setBusy(true);
    try { const r = await api<any>('/admin/samples', { method: load ? 'POST' : 'DELETE', query: load ? { n: 60 } : undefined }); toast('success', load ? `${r.created} laporan contoh dimuat` : `${r.deleted} laporan contoh dihapus`); qc.invalidateQueries({ queryKey: ['dash'] }); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } finally { setBusy(false); }
  };
  return <PageContainer preset="data">
    <PageHeader eyebrow="Sistem" title="Pengaturan" description="Merek, varian, dan daftar grosir langsung dipakai di aplikasi HP SPG. Pertanyaan form diubah di file apps/api/app/forms.py." />
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel><PanelHeader title="Merek & varian" subtitle="Varian muncul sebagai isian bungkus, stok, dan order di semua form" /><PanelBody className="grid gap-3">
        <Field label="Nama merek" htmlFor="brand"><Input id="brand" value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} /></Field>
        <ul className="grid gap-1">{v.variants.map((x, i) => <li key={x} className="flex items-center gap-2 text-sm"><span className="flex-1">{x}</span>
          <Button size="icon" variant="ghost" aria-label={`Naikkan ${x}`} disabled={!i} onClick={() => { const a = [...v.variants]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setV({ ...v, variants: a }); }}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" aria-label={`Hapus ${x}`} disabled={v.variants.length < 2} onClick={() => setV({ ...v, variants: v.variants.filter((y) => y !== x) })}><X className="h-4 w-4" /></Button></li>)}</ul>
        <div className="flex gap-2"><Input placeholder="Varian baru, contoh: Mint" aria-label="Varian baru" value={nv} onChange={(e) => setNv(e.target.value)} /><Button variant="secondary" onClick={() => { if (nv.trim()) { setV({ ...v, variants: [...v.variants, nv.trim()] }); setNv(''); } }}>Tambah</Button></div>
        <Button loading={busy} onClick={() => save()}>Simpan merek & varian</Button></PanelBody></Panel>
      <Panel><PanelHeader title="Daftar grosir" subtitle="Saran saat SPG mulai laporan; SPG tetap bisa menulis grosir baru" /><PanelBody className="grid gap-3">
        <ul className="grid max-h-72 gap-1 overflow-y-auto">{v.grosirs.map((g) => <li key={g} className="flex items-center justify-between text-sm">{g}<Button size="icon" variant="ghost" aria-label={`Hapus ${g}`} onClick={() => save({ ...v, grosirs: v.grosirs.filter((x) => x !== g) })}><X className="h-4 w-4" /></Button></li>)}
          {!v.grosirs.length && <li className="text-sm text-ink-muted">Belum ada grosir tersimpan.</li>}</ul>
        <div className="flex gap-2"><Input placeholder="Nama grosir" aria-label="Nama grosir" value={ng} onChange={(e) => setNg(e.target.value)} /><Button variant="secondary" onClick={() => { if (ng.trim()) { save({ ...v, grosirs: [...v.grosirs, ng.trim()] }); setNg(''); } }}>Tambah grosir</Button></div></PanelBody></Panel>
      <Panel className="lg:col-span-2"><PanelHeader title="Data contoh untuk demo" subtitle="60 laporan bernama fiktif, langsung berstatus disetujui dan ditandai sebagai contoh. Hapus sebelum dipakai sungguhan." />
        <PanelBody className="flex flex-wrap gap-2"><Button loading={busy} onClick={() => samples(true)}>Muat 60 laporan contoh</Button><Button variant="secondary" className="text-critical-text" disabled={busy} onClick={() => samples(false)}>Hapus data contoh</Button></PanelBody></Panel>
    </div></PageContainer>;
}

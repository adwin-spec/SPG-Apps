'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { selectCls, useWilayah } from './hooks';

export function WilayahView() {
  const w = useWilayah(true); const toast = useToast(); const qc = useQueryClient();
  const [prov, setProv] = useState(''); const [kab, setKab] = useState(''); const [q, setQ] = useState(''); const [names, setNames] = useState<Record<string, string>>({}); const [nk, setNk] = useState(''); const [nkab, setNkab] = useState('');
  const call = async (fn: () => Promise<unknown>, m: string) => { try { await fn(); toast('success', m); qc.invalidateQueries({ queryKey: ['wilayah'] }); } catch (e) { toast('error', e instanceof ApiError ? e.message : 'Gagal'); } };
  const rows = w.data ?? []; const provs = [...new Map(rows.map((k) => [k.provKode, k.provinsi])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const K = rows.find((k) => k.kode === kab); const total = rows.reduce((a, k) => a + k.kecamatan.filter((c) => !c.nonaktif).length, 0);
  return <>
    <PageHeader title="Wilayah" description={`${rows.length} kabupaten/kota · ${total.toLocaleString('id-ID')} kecamatan aktif · sumber awal: Kepmendagri No. 300.2.2-2138 Tahun 2025, bisa diedit`} />
    <Panel><PanelHeader title="Master kecamatan" subtitle="Kecamatan yang dinonaktifkan tidak muncul lagi di form SPG; laporan lama tetap menyimpan namanya." />
      <PanelBody className="grid gap-3">
        <div className="flex flex-wrap gap-2"><select aria-label="Provinsi" className={selectCls} value={prov} onChange={(e) => { setProv(e.target.value); setKab(''); }}><option value="">Pilih provinsi…</option>{provs.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <select aria-label="Kabupaten/kota" className={selectCls} value={kab} onChange={(e) => setKab(e.target.value)}><option value="">Pilih kabupaten/kota…</option>{rows.filter((k) => !prov || k.provKode === prov).map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}</select>
          {K && <Input className="w-56" placeholder="Cari kecamatan" aria-label="Cari kecamatan" value={q} onChange={(e) => setQ(e.target.value)} />}</div>
        {K ? <>
          <ul className="grid gap-1">{K.kecamatan.filter((c) => !q || c.nama.toLowerCase().includes(q.toLowerCase())).map((c) => <li key={c.kode} className={cn('grid grid-cols-[1fr_auto_auto_auto] items-center gap-2', c.nonaktif && 'opacity-60')}>
            <Input aria-label={`Nama kecamatan ${c.nama}`} value={names[c.kode] ?? c.nama} onChange={(e) => setNames({ ...names, [c.kode]: e.target.value })} />
            <span className="num text-xs text-ink-muted">{c.kode}</span>
            <Button size="sm" variant="secondary" disabled={!names[c.kode] || names[c.kode] === c.nama} onClick={() => call(() => api(`/wilayah/kecamatan/${c.kode}`, { method: 'PATCH', body: { nama: names[c.kode] } }), 'Nama disimpan')}>Simpan</Button>
            <Button size="sm" variant="ghost" className={c.nonaktif ? '' : 'text-critical-text'} onClick={() => call(() => api(`/wilayah/kecamatan/${c.kode}`, { method: 'PATCH', body: { active: !!c.nonaktif } }), c.nonaktif ? 'Diaktifkan' : 'Dinonaktifkan')}>{c.nonaktif ? 'Aktifkan' : 'Nonaktifkan'}</Button></li>)}</ul>
          <div className="flex gap-2"><Input placeholder={`Kecamatan baru di ${K.nama}`} aria-label="Kecamatan baru" value={nk} onChange={(e) => setNk(e.target.value)} /><Button variant="secondary" onClick={() => { call(() => api('/wilayah/kecamatan', { method: 'POST', body: { kab_kode: K.kode, nama: nk } }), 'Kecamatan ditambahkan'); setNk(''); }}>Tambah kecamatan</Button></div>
        </> : <p className="text-sm text-ink-muted">Pilih provinsi dan kabupaten/kota untuk melihat dan mengedit kecamatannya.</p>}
        {prov && <div className="flex gap-2 border-t border-border pt-3"><Input placeholder="Kabupaten/kota baru di provinsi ini" aria-label="Kabupaten/kota baru" value={nkab} onChange={(e) => setNkab(e.target.value)} />
          <Button variant="secondary" onClick={() => { call(() => api('/wilayah/kabupaten', { method: 'POST', body: { prov_kode: prov, nama: nkab } }), 'Kab/kota ditambahkan'); setNkab(''); }}>Tambah kab/kota</Button></div>}
      </PanelBody></Panel></>;
}

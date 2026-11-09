'use client';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api, apiPage } from '@/lib/api';
import { useFilters, type Filters } from '@/lib/use-filters';
import { Input, Select } from './ui/input';
import { Button } from './ui/button';

type Tree = { id: string; name: string; areas: { id: string; name: string; districts: { id: string; name: string; subdistricts: { id: string; name: string }[] }[] }[] }[];
export type FilterField = 'dates' | 'category' | 'region' | 'area' | 'district' | 'subdistrict' | 'supervisor' | 'spg' | 'brand';

/** One filter row above the charts (interaction spec). Values persist in the URL. */
export function FilterBar({ fields = ['dates', 'category', 'region', 'area', 'district', 'supervisor', 'spg'], defaults, extra }: { fields?: FilterField[]; defaults?: Filters; extra?: React.ReactNode }) {
  const { filters: f, setFilters } = useFilters(defaults);
  const tree = useQuery({ queryKey: ['org-tree'], queryFn: () => api<Tree>('/organization/tree'), staleTime: 600_000 });
  const sups = useQuery({ queryKey: ['supervisors', f.areaId], queryFn: () => api<{ id: string; fullName: string }[]>('/organization/supervisors', { query: { parentId: f.areaId } }), enabled: fields.includes('supervisor'), staleTime: 300_000 });
  const spgs = useQuery({ queryKey: ['spg-options', f.category, f.areaId, f.supervisorId], queryFn: () => apiPage<{ id: string; fullName: string }>('/spgs', { query: { pageSize: 200, category: f.category, areaId: f.areaId, supervisorId: f.supervisorId } }), enabled: fields.includes('spg'), staleTime: 300_000 });
  const lookups = useQuery({ queryKey: ['lookups'], queryFn: () => api<{ brands: { id: string; name: string; owner: string }[] }>('/lookups'), enabled: fields.includes('brand'), staleTime: 600_000 });
  const regions = tree.data ?? [];
  const areas = regions.filter((r) => !f.regionId || r.id === f.regionId).flatMap((r) => r.areas);
  const districts = areas.filter((a) => !f.areaId || a.id === f.areaId).flatMap((a) => a.districts);
  const subs = districts.filter((d) => !f.districtId || d.id === f.districtId).flatMap((d) => d.subdistricts);
  const sel = (key: keyof Filters, label: string, opts: { id: string; name: string }[], reset: (keyof Filters)[] = []) =>
    <Select aria-label={label} value={f[key] ?? ''} onChange={(e) => setFilters({ [key]: e.target.value, ...Object.fromEntries(reset.map((r) => [r, ''])) })} className="h-8 w-auto min-w-[8.5rem] max-w-[13rem] text-xs">
      <option value="">{label}: all</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>;
  return <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
    {fields.includes('dates') && <div className="flex items-center gap-1">
      <Input type="date" aria-label="From date" value={f.from ?? ''} max={f.to} onChange={(e) => setFilters({ from: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
      <span className="text-xs text-ink-muted">–</span>
      <Input type="date" aria-label="To date" value={f.to ?? ''} min={f.from} onChange={(e) => setFilters({ to: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
    </div>}
    {fields.includes('category') && sel('category', 'Category', [{ id: 'GROSIR', name: 'SPG Grosir' }, { id: 'HORECA', name: 'SPG HORECA' }, { id: 'REGULER', name: 'SPG Reguler' }], ['spgId'])}
    {fields.includes('region') && sel('regionId', 'Region', regions, ['areaId', 'districtId', 'subdistrictId', 'supervisorId', 'spgId'])}
    {fields.includes('area') && sel('areaId', 'Area', areas, ['districtId', 'subdistrictId', 'supervisorId', 'spgId'])}
    {fields.includes('district') && sel('districtId', 'Kabupaten', districts, ['subdistrictId'])}
    {fields.includes('subdistrict') && sel('subdistrictId', 'Kecamatan', subs)}
    {fields.includes('supervisor') && sel('supervisorId', 'Supervisor', (sups.data ?? []).map((s) => ({ id: s.id, name: s.fullName })), ['spgId'])}
    {fields.includes('spg') && sel('spgId', 'SPG', (spgs.data?.data ?? []).map((s) => ({ id: s.id, name: s.fullName })))}
    {fields.includes('brand') && sel('brandId', 'Competitor brand', (lookups.data?.brands ?? []).filter((b) => b.owner === 'COMPETITOR'))}
    {extra}
    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFilters(Object.fromEntries(['from', 'to', 'category', 'regionId', 'areaId', 'districtId', 'subdistrictId', 'supervisorId', 'spgId', 'brandId'].map((k) => [k, ''])))}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
  </div>;
}

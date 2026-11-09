'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, AlertTriangle } from 'lucide-react';
import { PERMISSIONS, outletCreateSchema } from '@tanda/shared';
import { ApiError, api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDate } from '@/lib/format';
import { ServerTable, SimpleTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, emptyToNull, numOrNull, useAreas, useSpgOptions } from '@/features/ops/common';

type Outlet = { id: string; code: string; name: string; channel: string; status: string; potentialClass: string | null; address: string | null; latitude: string | null; createdAt: string;
  category: { name: string } | null; district: { name: string; area: { name: string } }; subdistrict: { name: string } | null; assignedSpg: { fullName: string } | null };
type Dup = { id: string; code: string; name: string; channel: string; district: string; similarity: number };
const CHANNELS = ['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR'] as const;

const columns: ColumnDef<Outlet, unknown>[] = [
  { id: 'code', header: 'Outlet ID', accessorKey: 'code' },
  { id: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium text-primary">{row.original.name}</span> },
  { id: 'channel', header: 'Channel', cell: ({ row }) => <Badge>{row.original.channel}</Badge> },
  { id: 'category', header: 'Type', cell: ({ row }) => row.original.category?.name ?? '–' },
  { id: 'geo', header: 'Kabupaten / Kecamatan', cell: ({ row }) => `${row.original.district.name}${row.original.subdistrict ? ' / ' + row.original.subdistrict.name : ''}` },
  { id: 'spg', header: 'Assigned SPG', cell: ({ row }) => row.original.assignedSpg?.fullName ?? <span className="text-ink-muted">–</span> },
  { id: 'gps', header: 'GPS', cell: ({ row }) => row.original.latitude ? <Badge tone="good">Yes</Badge> : <Badge tone="warn" icon>Missing</Badge> },
  { id: 'pc', header: 'Potential', cell: ({ row }) => row.original.potentialClass ?? '–' },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { id: 'createdAt', header: 'Recorded', cell: ({ row }) => fmtDate(row.original.createdAt) },
];

type FormIn = z.input<typeof outletCreateSchema>;
function AddOutletDialog({ onClose, defaultChannel }: { onClose: () => void; defaultChannel: (typeof CHANNELS)[number] }) {
  const qc = useQueryClient(); const toast = useToast(); const router = useRouter(); const areas = useAreas();
  const [areaId, setAreaId] = useState('');
  const [dups, setDups] = useState<Dup[] | null>(null);
  const form = useForm<FormIn>({ resolver: zodResolver(outletCreateSchema), defaultValues: { channel: defaultChannel, status: 'ACTIVE', alternativeWholesalerIds: [] } });
  const channel = form.watch('channel'); const name = form.watch('name'); const districtId = form.watch('districtId');
  const districts = areas.filter((a) => !areaId || a.id === areaId).flatMap((a) => a.districts);
  const subs = districts.find((d) => d.id === districtId)?.subdistricts ?? [];
  const spgs = useSpgOptions({ areaId: areaId || undefined, status: 'ACTIVE' });
  const wholesalers = useQuery({ queryKey: ['wholesalers-opt', areaId], queryFn: () => apiPage<{ id: string; name: string; code: string }>('/outlets', { query: { channel: 'WHOLESALER', pageSize: 200, areaId: areaId || undefined } }), enabled: channel === 'RETAILER' });
  const [debName, setDebName] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebName(name ?? ''), 400); return () => clearTimeout(t); }, [name]);
  const hint = useQuery({ queryKey: ['dup-hint', debName, districtId, channel], queryFn: () => api<Dup[]>('/outlets/duplicates', { query: { name: debName, districtId: districtId || undefined, channel } }), enabled: debName.trim().length >= 3 });
  const m = useMutation({ mutationFn: (v: z.output<typeof outletCreateSchema>) => api<{ id: string }>('/outlets', { method: 'POST', body: v }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['outlets'] }); toast('success', 'Outlet created'); onClose(); router.push(`/outlets/${r.id}`); },
    onError: (e) => { if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE') setDups(e.details as Dup[]); } });
  const submit = (confirm: boolean) => form.handleSubmit((v) => m.mutate({ ...(v as z.output<typeof outletCreateSchema>), confirmNotDuplicate: confirm || undefined }))();
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title="Add outlet" size="lg"
    footer={dups ? <><Button variant="secondary" onClick={() => setDups(null)}>Back to form</Button><Button variant="secondary" onClick={onClose}>Use existing outlet</Button><Button loading={m.isPending} onClick={() => submit(true)}>This is a new outlet</Button></>
      : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => submit(false)}>Create outlet</Button></>}>
    {dups ? <div>
      <div className="mb-3 flex gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn-text"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><b>Possible duplicate.</b> Outlets with a similar name already exist. Do not create a new outlet for a spelling variant – open the existing one instead. Confirm only if this is genuinely a different outlet; the confirmation is recorded in the audit trail.</div></div>
      <SimpleTable rows={dups as unknown as Record<string, unknown>[]} columns={[{ key: 'code', label: 'ID', render: (r) => <a className="text-primary hover:underline" href={`/outlets/${r.id}`} target="_blank" rel="noreferrer">{String(r.code)}</a> }, { key: 'name', label: 'Name' }, { key: 'channel', label: 'Channel' }, { key: 'district', label: 'Kabupaten' }, { key: 'similarity', label: 'Similarity', align: 'right', render: (r) => `${Math.round(Number(r.similarity) * 100)}%` }]} />
    </div> : <>
      <ApiErrorBox error={m.error && !(m.error instanceof ApiError && m.error.code === 'POSSIBLE_DUPLICATE') ? m.error : null} />
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(ev) => ev.preventDefault()}>
        <Field className="sm:col-span-2" label="Outlet name" required error={e.name?.message}><Input {...form.register('name')} /></Field>
        <Field label="Channel" required><Select {...form.register('channel')}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        {!!hint.data?.length && <div className="sm:col-span-3 rounded bg-warn-soft px-3 py-2 text-xs text-warn-text"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Similar existing outlets: {hint.data.slice(0, 4).map((d) => `${d.name} (${d.code}, ${d.district}, ${Math.round(d.similarity * 100)}%)`).join('; ')}</div>}
        <Field label="Area"><Select value={areaId} onChange={(ev) => { setAreaId(ev.target.value); form.setValue('districtId', ''); }}><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Kabupaten" required error={e.districtId?.message}><Select {...form.register('districtId')}><option value="">Select…</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Kecamatan"><Select {...form.register('subdistrictId', { setValueAs: emptyToNull })} disabled={!districtId}><option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field className="sm:col-span-3" label="Address"><Textarea {...form.register('address', { setValueAs: emptyToNull })} className="min-h-[48px]" /></Field>
        <Field label="Latitude" error={e.latitude?.message}><Input inputMode="decimal" {...form.register('latitude', { setValueAs: numOrNull })} placeholder="-7.2575" /></Field>
        <Field label="Longitude" error={e.longitude?.message}><Input inputMode="decimal" {...form.register('longitude', { setValueAs: numOrNull })} placeholder="112.7521" /></Field>
        <Field label="Geofence radius (m)" hint="Blank = system default"><Input inputMode="numeric" {...form.register('geofenceRadiusM', { setValueAs: numOrNull })} /></Field>
        <Field label="PIC"><Input {...form.register('picName', { setValueAs: emptyToNull })} /></Field>
        <Field label="Phone"><Input {...form.register('phone', { setValueAs: emptyToNull })} /></Field>
        <Field label="Potential class"><Select {...form.register('potentialClass', { setValueAs: emptyToNull })}><option value="">—</option>{['A', 'B', 'C', 'D'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Status"><Select {...form.register('status')}>{['PROSPECT', 'ACTIVE', 'INACTIVE'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field className="sm:col-span-2" label="Assigned SPG"><Select {...form.register('assignedSpgId', { setValueAs: emptyToNull })}><option value="">—</option>{(spgs.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.category.code})</option>)}</Select></Field>
        {channel === 'RETAILER' && <>
          <Field className="sm:col-span-3" label="Primary wholesaler (grosir utama)"><Select {...form.register('primaryWholesalerId', { setValueAs: emptyToNull })}><option value="">—</option>{(wholesalers.data?.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}</Select></Field>
          <Field className="sm:col-span-3" label="Alternative wholesalers" hint="Ctrl/Cmd-click to select several"><select multiple className="h-28 w-full rounded-md border border-border px-2 py-1 text-sm" {...form.register('alternativeWholesalerIds')}>{(wholesalers.data?.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}</select></Field>
        </>}
      </form></>}
  </Dialog>;
}

export default function OutletsPage() {
  const router = useRouter(); const { can, canAny } = useAuth(); const { filters } = useFilters();
  const [channel, setChannel] = useState('all'); const [status, setStatus] = useState(''); const [open, setOpen] = useState(false);
  return <>
    <PageHeader title="Outlets" description="Unified master for wholesalers (grosir), retailers, HORECA and regular outlets"
      actions={canAny(PERMISSIONS.OUTLET_MANAGE) && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add outlet</Button>} />
    <FilterBar fields={['region', 'area', 'district', 'subdistrict']} extra={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs"><option value="">Status: all</option>{['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select>} />
    <Tabs value={channel} onValueChange={setChannel}><TabsList>
      <TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="WHOLESALER">Wholesalers</TabsTrigger><TabsTrigger value="RETAILER">Retailers</TabsTrigger><TabsTrigger value="HORECA">HORECA</TabsTrigger><TabsTrigger value="REGULAR">Regular</TabsTrigger>
    </TabsList></Tabs>
    <Panel>
      <ServerTable<Outlet> queryKey={['outlets']} endpoint="/outlets" columns={columns} sortable={['name', 'code', 'createdAt', 'status', 'channel']} searchPlaceholder="Search name or ID (spelling-tolerant)…"
        params={{ channel: channel === 'all' ? undefined : channel, status: status || undefined, areaId: filters.areaId, districtId: filters.districtId, subdistrictId: filters.subdistrictId }}
        onRowClick={(r) => router.push(`/outlets/${r.id}`)} />
    </Panel>
    {open && can(PERMISSIONS.OUTLET_MANAGE) && <AddOutletDialog onClose={() => setOpen(false)} defaultChannel={channel === 'all' ? 'REGULAR' : (channel as (typeof CHANNELS)[number])} />}
  </>;
}

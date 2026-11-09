'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PERMISSIONS, outletUpdateSchema, retailerLinkSchema } from '@tanda/shared';
import { api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { PageHeader, Panel, PanelBody, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, Details, emptyToNull, numOrNull, useSpgOptions } from '@/features/ops/common';

type Link_ = { id: string; relationType: string; effectiveFrom: string; effectiveTo: string | null; wholesaler: { id: string; name: string; code: string } };
type OutletDetail = { id: string; code: string; name: string; channel: string; status: string; version: number; address: string | null; latitude: string | null; longitude: string | null; geofenceRadiusM: number | null;
  picName: string | null; phone: string | null; potentialClass: string | null; firstRecordedAt: string; districtId: string; subdistrictId: string | null; assignedSpgId: string | null;
  category: { name: string } | null; district: { name: string; area: { id: string; name: string } }; subdistrict: { name: string } | null; assignedSpg: { id: string; fullName: string; employeeCode: string } | null;
  assignmentHistory: { id: string; spgId: string | null; effectiveFrom: string; effectiveTo: string | null; reason: string | null }[];
  retailerLinks: Link_[]; wholesalerLinks: { id: string; relationType: string; retailer: { id: string; name: string; code: string; status: string } }[] };

function EditDialog({ o, onClose }: { o: OutletDetail; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const spgs = useSpgOptions({ areaId: o.district.area.id });
  const form = useForm<z.input<typeof outletUpdateSchema>>({ resolver: zodResolver(outletUpdateSchema), defaultValues: { expectedVersion: o.version, name: o.name, address: o.address, latitude: o.latitude ? Number(o.latitude) : null,
    longitude: o.longitude ? Number(o.longitude) : null, geofenceRadiusM: o.geofenceRadiusM, picName: o.picName, phone: o.phone, potentialClass: o.potentialClass, status: o.status as 'ACTIVE', assignedSpgId: o.assignedSpgId, reason: '' } });
  const m = useMutation({ mutationFn: (v: z.output<typeof outletUpdateSchema>) => api(`/outlets/${o.id}`, { method: 'PATCH', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outlet', o.id] }); qc.invalidateQueries({ queryKey: ['outlets'] }); toast('success', 'Outlet updated – change recorded in history'); onClose(); } });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(x) => !x && onClose()} title={`Edit ${o.name}`} size="lg"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof outletUpdateSchema>))}>Save</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(ev) => ev.preventDefault()}>
      <Field className="sm:col-span-2" label="Name" error={e.name?.message}><Input {...form.register('name')} /></Field>
      <Field label="Status"><Select {...form.register('status')}>{['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <Field className="sm:col-span-3" label="Address"><Textarea {...form.register('address', { setValueAs: emptyToNull })} className="min-h-[48px]" /></Field>
      <Field label="Latitude" error={e.latitude?.message}><Input {...form.register('latitude', { setValueAs: numOrNull })} /></Field>
      <Field label="Longitude" error={e.longitude?.message}><Input {...form.register('longitude', { setValueAs: numOrNull })} /></Field>
      <Field label="Geofence radius (m)" error={e.geofenceRadiusM?.message}><Input {...form.register('geofenceRadiusM', { setValueAs: numOrNull })} /></Field>
      <Field label="PIC"><Input {...form.register('picName', { setValueAs: emptyToNull })} /></Field>
      <Field label="Phone"><Input {...form.register('phone', { setValueAs: emptyToNull })} /></Field>
      <Field label="Potential class"><Select {...form.register('potentialClass', { setValueAs: emptyToNull })}><option value="">—</option>{['A', 'B', 'C', 'D'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field className="sm:col-span-3" label="Assigned SPG" hint="Changing the SPG closes the previous assignment period"><Select {...form.register('assignedSpgId', { setValueAs: emptyToNull })}><option value="">— Unassigned</option>{(spgs.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.category.code})</option>)}</Select></Field>
      <Field className="sm:col-span-3" label="Reason for change" error={e.reason?.message}><Textarea {...form.register('reason', { setValueAs: (v) => v || undefined })} /></Field>
    </form>
  </Dialog>;
}

function LinkDialog({ o, onClose }: { o: OutletDetail; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const ws = useQuery({ queryKey: ['wholesalers-opt', o.district.area.id], queryFn: () => apiPage<{ id: string; name: string; code: string }>('/outlets', { query: { channel: 'WHOLESALER', pageSize: 200, areaId: o.district.area.id } }) });
  const form = useForm<z.input<typeof retailerLinkSchema>>({ resolver: zodResolver(retailerLinkSchema), defaultValues: { relationType: 'ALTERNATIVE' } });
  const m = useMutation({ mutationFn: (v: z.output<typeof retailerLinkSchema>) => api(`/outlets/${o.id}/wholesalers`, { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outlet', o.id] }); toast('success', 'Wholesaler linked'); onClose(); } });
  return <Dialog open onOpenChange={(x) => !x && onClose()} title="Link wholesaler" description="Setting a new PRIMARY ends the current primary link (history kept)."
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof retailerLinkSchema>))}>Link</Button></>}>
    <ApiErrorBox error={m.error} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Wholesaler" required error={form.formState.errors.wholesalerOutletId?.message}><Select {...form.register('wholesalerOutletId')}><option value="">Select…</option>{(ws.data?.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}</Select></Field>
      <Field label="Relation"><Select {...form.register('relationType')}><option value="PRIMARY">Primary (grosir utama)</option><option value="ALTERNATIVE">Alternative</option></Select></Field>
    </div></Dialog>;
}

export default function OutletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { can } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [dialog, setDialog] = useState<'edit' | 'link' | null>(null);
  const q = useQuery({ queryKey: ['outlet', id], queryFn: () => api<OutletDetail>(`/outlets/${id}`) });
  const unlink = useMutation({ mutationFn: (linkId: string) => api(`/outlets/${id}/wholesalers/${linkId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outlet', id] }); toast('success', 'Link ended'); }, onError: (e) => toast('error', (e as Error).message) });
  const o = q.data;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!o) return <Skeleton className="h-64" />;
  const manage = can(PERMISSIONS.OUTLET_MANAGE);
  return <>
    <PageHeader title={o.name} description={`${o.code} · ${o.channel}${o.category ? ' · ' + o.category.name : ''}`} actions={<>
      <Button asChild variant="secondary"><Link href={`/attendance/visits?outletId=${o.id}&from=2000-01-01`}>Visits</Link></Button>
      {o.channel === 'RETAILER' && <Button asChild variant="secondary"><Link href={`/grosir/retailers/${o.id}`}>Transaction history</Link></Button>}
      {o.channel === 'WHOLESALER' && <Button asChild variant="secondary"><Link href={`/grosir/wholesalers/${o.id}`}>Wholesale intelligence</Link></Button>}
      {manage && <Button onClick={() => setDialog('edit')}>Edit</Button>}</>} />
    <Panel><PanelHeader title="Outlet details" actions={<StatusBadge status={o.status} />} />
      <PanelBody><Details items={[
        ['Address', o.address], ['Kabupaten', o.district.name], ['Kecamatan', o.subdistrict?.name ?? '–'], ['Area', o.district.area.name],
        ['GPS', o.latitude ? `${Number(o.latitude).toFixed(6)}, ${Number(o.longitude).toFixed(6)}` : <Badge key="g" tone="warn" icon>Missing – geofence cannot be verified</Badge>],
        ['Geofence radius', o.geofenceRadiusM ? `${o.geofenceRadiusM} m` : 'System default'], ['PIC', o.picName], ['Phone', o.phone], ['Potential class', o.potentialClass],
        ['Assigned SPG', o.assignedSpg ? <Link key="s" className="text-primary hover:underline" href={`/spgs/${o.assignedSpg.id}`}>{o.assignedSpg.fullName}</Link> : '–'], ['First recorded', fmtDate(o.firstRecordedAt)], ['Version', o.version],
      ]} /></PanelBody></Panel>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {o.channel === 'RETAILER' && <Panel><PanelHeader title="Wholesaler relationships" subtitle="A retailer may buy from several wholesalers" actions={manage && <Button size="sm" onClick={() => setDialog('link')}>Link wholesaler</Button>} />
        <SimpleTable rows={o.retailerLinks as unknown as Record<string, unknown>[]} columns={[
          { key: 'w', label: 'Wholesaler', render: (r) => <Link className="text-primary hover:underline" href={`/outlets/${(r.wholesaler as Link_['wholesaler']).id}`}>{(r.wholesaler as Link_['wholesaler']).name}</Link> },
          { key: 'relationType', label: 'Type', render: (r) => <Badge tone={r.relationType === 'PRIMARY' ? 'info' : 'neutral'}>{String(r.relationType)}</Badge> },
          { key: 'effectiveFrom', label: 'From', render: (r) => fmtDate(r.effectiveFrom) }, { key: 'effectiveTo', label: 'To', render: (r) => (r.effectiveTo ? fmtDate(r.effectiveTo) : <Badge tone="good">Active</Badge>) },
          ...(manage ? [{ key: 'a', label: '', render: (r: Record<string, unknown>) => !r.effectiveTo ? <Button size="sm" variant="ghost" loading={unlink.isPending} onClick={() => unlink.mutate(String(r.id))}>End</Button> : null }] : []),
        ]} /></Panel>}
      {o.channel === 'WHOLESALER' && <Panel><PanelHeader title={`Linked retailers (${o.wholesalerLinks.length})`} />
        <SimpleTable rows={o.wholesalerLinks as unknown as Record<string, unknown>[]} max={100} columns={[
          { key: 'r', label: 'Retailer', render: (r) => { const x = r.retailer as OutletDetail['wholesalerLinks'][number]['retailer']; return <Link className="text-primary hover:underline" href={`/outlets/${x.id}`}>{x.name}</Link>; } },
          { key: 'c', label: 'ID', render: (r) => (r.retailer as { code: string }).code }, { key: 'relationType', label: 'Type' }, { key: 's', label: 'Status', render: (r) => <StatusBadge status={(r.retailer as { status: string }).status} /> }]} /></Panel>}
      <Panel><PanelHeader title="SPG assignment history" />
        <SimpleTable rows={o.assignmentHistory as unknown as Record<string, unknown>[]} columns={[{ key: 'effectiveFrom', label: 'From', render: (r) => fmtDateTime(r.effectiveFrom) },
          { key: 'effectiveTo', label: 'To', render: (r) => (r.effectiveTo ? fmtDateTime(r.effectiveTo) : <Badge tone="good">Current</Badge>) }, { key: 'spgId', label: 'SPG', render: (r) => (r.spgId ? String(r.spgId).slice(0, 8) + '…' : 'Unassigned') }, { key: 'reason', label: 'Reason' }]} /></Panel>
    </div>
    {dialog === 'edit' && <EditDialog o={o} onClose={() => setDialog(null)} />}
    {dialog === 'link' && <LinkDialog o={o} onClose={() => setDialog(null)} />}
  </>;
}

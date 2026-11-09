'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PERMISSIONS, spgAssignSchema, spgUpdateSchema, jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { PageHeader, Panel, PanelBody, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, Details, emptyToNull, useAreas, useSupervisors } from '@/features/ops/common';

type SpgDetail = { id: string; employeeCode: string; fullName: string; phone: string | null; status: string; version: number; joinDate: string; endDate: string | null; currentAreaId: string;
  category: { code: string; name: string }; currentArea: { id: string; name: string; region: { name: string } }; currentSupervisor: { id: string; user: { fullName: string } } | null;
  user: { id: string; email: string; isActive: boolean } | null; _count: { assignedOutlets: number };
  assignments: { id: string; effectiveFrom: string; effectiveTo: string | null; reason: string | null; area: { name: string }; territory: { name: string } | null; supervisor: { user: { fullName: string } } | null }[];
  employmentHistory: { id: string; eventType: string; fromValue: unknown; toValue: unknown; effectiveDate: string; note: string | null; createdAt: string }[] };

function EditDialog({ spg, onClose }: { spg: SpgDetail; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const form = useForm<z.input<typeof spgUpdateSchema>>({ resolver: zodResolver(spgUpdateSchema), defaultValues: { expectedVersion: spg.version, fullName: spg.fullName, phone: spg.phone, status: spg.status as 'ACTIVE', category: spg.category.code as 'GROSIR', reason: '' } });
  const m = useMutation({ mutationFn: (v: z.output<typeof spgUpdateSchema>) => api(`/spgs/${spg.id}`, { method: 'PATCH', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spg', spg.id] }); qc.invalidateQueries({ queryKey: ['spgs'] }); toast('success', 'SPG updated'); onClose(); } });
  const e = form.formState.errors; const status = form.watch('status');
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${spg.fullName}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof spgUpdateSchema>))}>Save changes</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      <Field label="Full name" error={e.fullName?.message}><Input {...form.register('fullName')} /></Field>
      <Field label="Phone" error={e.phone?.message}><Input {...form.register('phone', { setValueAs: emptyToNull })} /></Field>
      <Field label="Status" error={e.status?.message}><Select {...form.register('status')}>{['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <Field label="Category" error={e.category?.message}><Select {...form.register('category')}><option value="GROSIR">SPG Grosir</option><option value="HORECA">SPG HORECA</option><option value="REGULER">SPG Reguler</option></Select></Field>
      <Field label="End date" error={e.endDate?.message}><Input type="date" {...form.register('endDate', { setValueAs: emptyToNull })} /></Field>
      {(status === 'INACTIVE' || status === 'RESIGNED') && spg.user && <p className="sm:col-span-2 rounded bg-warn-soft px-3 py-2 text-xs text-warn-text">The SPG's login will be deactivated and all sessions revoked.</p>}
      <Field className="sm:col-span-2" label="Reason for change" required error={e.reason?.message}><Textarea {...form.register('reason')} /></Field>
    </form>
  </Dialog>;
}

function AssignDialog({ spg, onClose }: { spg: SpgDetail; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const areas = useAreas();
  const form = useForm<z.input<typeof spgAssignSchema>>({ resolver: zodResolver(spgAssignSchema), defaultValues: { areaId: spg.currentAreaId, effectiveFrom: jakartaDate(), supervisorId: spg.currentSupervisor?.id ?? null } });
  const areaId = form.watch('areaId');
  const sups = useSupervisors(areaId || undefined);
  const terr = useQuery({ queryKey: ['territories', areaId], queryFn: () => api<{ id: string; name: string }[]>('/organization/territories', { query: { parentId: areaId } }), enabled: !!areaId });
  const m = useMutation({ mutationFn: (v: z.output<typeof spgAssignSchema>) => api(`/spgs/${spg.id}/assignments`, { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spg', spg.id] }); toast('success', 'Assignment updated – history preserved'); onClose(); } });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title="Reassign SPG" description="Closes the current assignment and opens a new one from the effective date."
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof spgAssignSchema>))}>Reassign</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      <Field label="Area" required error={e.areaId?.message}><Select {...form.register('areaId')}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.regionName})</option>)}</Select></Field>
      <Field label="Territory"><Select {...form.register('territoryId', { setValueAs: emptyToNull })}><option value="">—</option>{(terr.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <Field label="Supervisor" error={e.supervisorId?.message}><Select {...form.register('supervisorId', { setValueAs: emptyToNull })}><option value="">—</option>{(sups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></Field>
      <Field label="Effective from" required error={e.effectiveFrom?.message}><Input type="date" {...form.register('effectiveFrom')} /></Field>
      <Field className="sm:col-span-2" label="Reason" required error={e.reason?.message}><Textarea {...form.register('reason')} /></Field>
    </form>
  </Dialog>;
}

export default function SpgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { can } = useAuth();
  const [dialog, setDialog] = useState<'edit' | 'assign' | null>(null);
  const q = useQuery({ queryKey: ['spg', id], queryFn: () => api<SpgDetail>(`/spgs/${id}`) });
  const s = q.data;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!s) return <Skeleton className="h-64" />;
  const period = jakartaDate().slice(0, 7);
  return <>
    <PageHeader title={s.fullName} description={`${s.employeeCode} · ${s.category.name}`} actions={<>
      <Button asChild variant="secondary"><Link href={`/performance/${s.id}?period=${period}`}>Performance</Link></Button>
      <Button asChild variant="secondary"><Link href={`/attendance/visits?spgId=${s.id}`}>Visits</Link></Button>
      {can(PERMISSIONS.SPG_MANAGE) && <><Button variant="secondary" onClick={() => setDialog('assign')}>Reassign</Button><Button onClick={() => setDialog('edit')}>Edit</Button></>}
    </>} />
    <Panel><PanelHeader title="Profile" actions={<StatusBadge status={s.status} />} />
      <PanelBody><Details items={[
        ['SPG ID', s.employeeCode], ['Category', <Badge key="c" tone="info">{s.category.code}</Badge>], ['Phone', s.phone ?? '–'],
        ['Area', `${s.currentArea.name} · ${s.currentArea.region.name}`], ['Supervisor', s.currentSupervisor?.user.fullName ?? 'Unassigned'], ['Assigned outlets', s._count.assignedOutlets],
        ['Join date', fmtDate(s.joinDate)], ['End date', fmtDate(s.endDate)], ['Login', s.user ? `${s.user.email}${s.user.isActive ? '' : ' (inactive)'}` : 'No login'], ['Record version', s.version],
      ]} /></PanelBody></Panel>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Assignment history" subtitle="Effective-dated; open row = current" />
        <SimpleTable rows={s.assignments as unknown as Record<string, unknown>[]} columns={[
          { key: 'effectiveFrom', label: 'From', render: (r) => fmtDate(r.effectiveFrom) }, { key: 'effectiveTo', label: 'To', render: (r) => r.effectiveTo ? fmtDate(r.effectiveTo) : <Badge tone="good">Current</Badge> },
          { key: 'area', label: 'Area', render: (r) => (r.area as { name: string }).name }, { key: 'territory', label: 'Territory', render: (r) => (r.territory as { name: string } | null)?.name ?? '–' },
          { key: 'supervisor', label: 'Supervisor', render: (r) => (r.supervisor as { user: { fullName: string } } | null)?.user.fullName ?? '–' }, { key: 'reason', label: 'Reason' }]} /></Panel>
      <Panel><PanelHeader title="Employment history" />
        <SimpleTable rows={s.employmentHistory as unknown as Record<string, unknown>[]} columns={[
          { key: 'effectiveDate', label: 'Date', render: (r) => fmtDate(r.effectiveDate) }, { key: 'eventType', label: 'Event', render: (r) => <Badge>{String(r.eventType)}</Badge> },
          { key: 'change', label: 'Change', render: (r) => <span className="text-xs">{r.fromValue ? JSON.stringify(r.fromValue) + ' → ' : ''}{JSON.stringify(r.toValue ?? '')}</span> },
          { key: 'note', label: 'Note' }, { key: 'createdAt', label: 'Recorded', render: (r) => fmtDateTime(r.createdAt) }]} /></Panel>
    </div>
    {dialog === 'edit' && <EditDialog spg={s} onClose={() => setDialog(null)} />}
    {dialog === 'assign' && <AssignDialog spg={s} onClose={() => setDialog(null)} />}
  </>;
}

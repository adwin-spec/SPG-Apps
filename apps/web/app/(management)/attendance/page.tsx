'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { ShieldAlert } from 'lucide-react';
import { PERMISSIONS, attendanceOverrideSchema, jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ServerTable, SimpleTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, useSpgOptions } from '@/features/ops/common';

type Att = { id: string; spgId: string; workDate: string; status: string; checkInAt: string | null; checkOutAt: string | null; checkInAccuracyM: number | null; source: string; isLate: boolean;
  overrideReason: string | null; note: string | null; spg: { fullName: string; employeeCode: string; category: { code: string } } };

const toLocalInput = (iso?: string | null) => iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : '';
const fromLocalInput = (v: unknown) => (v ? new Date(`${v}:00+07:00`).toISOString() : undefined);

function OverrideDialog({ initial, onClose }: { initial?: Partial<Att>; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const spgs = useSpgOptions();
  const form = useForm<z.input<typeof attendanceOverrideSchema>>({ resolver: zodResolver(attendanceOverrideSchema),
    defaultValues: { spgId: initial?.spgId ?? '', workDate: initial?.workDate?.slice(0, 10) ?? jakartaDate(), status: (initial?.status as 'CHECKED_IN') ?? 'CHECKED_OUT', checkInAt: initial?.checkInAt ?? undefined, checkOutAt: initial?.checkOutAt ?? undefined, reason: '' } });
  const m = useMutation({ mutationFn: (v: z.output<typeof attendanceOverrideSchema>) => api('/attendance/override', { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['att-missing'] }); toast('success', 'Override recorded in the audit trail'); onClose(); } });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title="Supervisor override" description="Times are Asia/Jakarta. A reason is mandatory and the change is audited."
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof attendanceOverrideSchema>))}>Save override</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      <Field label="SPG" required error={e.spgId?.message}><Select {...form.register('spgId')} disabled={!!initial?.spgId}><option value="">Select…</option>{(spgs.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></Field>
      <Field label="Work date" required error={e.workDate?.message}><Input type="date" {...form.register('workDate')} disabled={!!initial?.workDate} /></Field>
      <Field label="Status" required><Select {...form.register('status')}>{['CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LEAVE'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <div />
      <Field label="Check-in (WIB)" error={e.checkInAt?.message}><Input type="datetime-local" defaultValue={toLocalInput(initial?.checkInAt)} onChange={(ev) => form.setValue('checkInAt', fromLocalInput(ev.target.value))} /></Field>
      <Field label="Check-out (WIB)" error={e.checkOutAt?.message}><Input type="datetime-local" defaultValue={toLocalInput(initial?.checkOutAt)} onChange={(ev) => form.setValue('checkOutAt', fromLocalInput(ev.target.value))} /></Field>
      <Field className="sm:col-span-2" label="Reason" required error={e.reason?.message}><Textarea {...form.register('reason')} /></Field>
    </form>
  </Dialog>;
}

export default function AttendancePage() {
  const { can } = useAuth(); const { filters } = useFilters();
  const [status, setStatus] = useState('');
  const [override, setOverride] = useState<Partial<Att> | null>(null);
  const today = jakartaDate();
  const missing = useQuery({ queryKey: ['att-missing', today], queryFn: () => api<{ id: string; fullName: string; employeeCode: string; phone: string | null; category: { code: string }; currentSupervisor: { user: { fullName: string } } | null }[]>('/attendance/missing', { query: { date: today } }) });
  const canOverride = can(PERMISSIONS.ATTENDANCE_OVERRIDE);
  const columns: ColumnDef<Att, unknown>[] = [
    { id: 'workDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.workDate) },
    { id: 'spg', header: 'SPG', cell: ({ row }) => <span><span className="font-medium">{row.original.spg.fullName}</span> <span className="text-xs text-ink-muted">{row.original.spg.employeeCode}</span></span> },
    { id: 'cat', header: 'Cat.', cell: ({ row }) => row.original.spg.category.code },
    { id: 'in', header: 'Check-in', cell: ({ row }) => <span>{fmtDateTime(row.original.checkInAt)} {row.original.isLate && <Badge tone="warn" icon>Late</Badge>}</span> },
    { id: 'out', header: 'Check-out', cell: ({ row }) => fmtDateTime(row.original.checkOutAt) },
    { id: 'acc', header: 'GPS acc.', meta: { align: 'right' }, cell: ({ row }) => row.original.checkInAccuracyM != null ? `${row.original.checkInAccuracyM} m` : '–' },
    { id: 'source', header: 'Source', cell: ({ row }) => <Badge>{row.original.source}</Badge> },
    { id: 'status', header: 'Status', cell: ({ row }) => <span className="inline-flex gap-1"><StatusBadge status={row.original.status} />{row.original.overrideReason && <span title={row.original.overrideReason}><Badge tone="serious" icon>Override</Badge></span>}</span> },
    ...(canOverride ? [{ id: 'act', header: '', cell: ({ row }: { row: { original: Att } }) => <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setOverride(row.original); }}>Override</Button> } as ColumnDef<Att, unknown>] : []),
  ];
  return <>
    <PageHeader title="Attendance" description="Daily check-in / check-out with GPS. Times in Asia/Jakarta (WIB)." actions={canOverride && <Button variant="secondary" onClick={() => setOverride({})}><ShieldAlert className="h-4 w-4" />New override</Button>} />
    <FilterBar fields={['dates', 'spg']} extra={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs"><option value="">Status: all</option>{['CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LEAVE'].map((s) => <option key={s}>{s}</option>)}</Select>} />
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Panel><ServerTable<Att> queryKey={['attendance']} endpoint="/attendance" columns={columns} searchable={false} params={{ from: filters.from, to: filters.to, spgId: filters.spgId, status: status || undefined }} /></Panel>
      <Panel><PanelHeader title="Not checked in today" subtitle={`${missing.data?.length ?? '…'} active SPG without attendance on ${fmtDate(today)}`} />
        <SimpleTable rows={(missing.data ?? []) as unknown as Record<string, unknown>[]} max={50} columns={[
          { key: 'fullName', label: 'SPG', render: (r) => <span><span className="font-medium">{String(r.fullName)}</span><br /><span className="text-2xs text-ink-muted">{String(r.employeeCode)} · {(r.category as { code: string }).code}</span></span> },
          { key: 'sup', label: 'Supervisor', render: (r) => (r.currentSupervisor as { user: { fullName: string } } | null)?.user.fullName ?? '–' },
          ...(canOverride ? [{ key: 'a', label: '', render: (r: Record<string, unknown>) => <Button size="sm" variant="ghost" onClick={() => setOverride({ spgId: String(r.id), workDate: today, status: 'ABSENT' })}>Set</Button> }] : []),
        ]} /></Panel>
    </div>
    {override && <OverrideDialog initial={override} onClose={() => setOverride(null)} />}
  </>;
}

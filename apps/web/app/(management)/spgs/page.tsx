'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PERMISSIONS, spgCreateSchema, jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDate } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, emptyToNull, useAreas, useSupervisors } from '@/features/ops/common';

type Spg = { id: string; employeeCode: string; fullName: string; phone: string | null; status: string; joinDate: string; category: { code: string }; currentArea: { name: string; region: { name: string } };
  currentSupervisor: { user: { fullName: string } } | null; user: { email: string; isActive: boolean } | null; _count: { assignedOutlets: number } };

const columns: ColumnDef<Spg, unknown>[] = [
  { id: 'employeeCode', header: 'SPG ID', accessorKey: 'employeeCode' },
  { id: 'fullName', header: 'Name', accessorKey: 'fullName', cell: ({ row }) => <span className="font-medium text-primary">{row.original.fullName}</span> },
  { id: 'category', header: 'Category', cell: ({ row }) => <Badge tone="info">{row.original.category.code}</Badge> },
  { id: 'area', header: 'Area', cell: ({ row }) => `${row.original.currentArea.name} · ${row.original.currentArea.region.name}` },
  { id: 'supervisor', header: 'Supervisor', cell: ({ row }) => row.original.currentSupervisor?.user.fullName ?? <span className="text-critical-text">Unassigned</span> },
  { id: 'outlets', header: 'Outlets', meta: { align: 'right' }, cell: ({ row }) => row.original._count.assignedOutlets },
  { id: 'login', header: 'Login', cell: ({ row }) => row.original.user ? (row.original.user.isActive ? row.original.user.email : <span className="text-ink-muted line-through">{row.original.user.email}</span>) : <span className="text-ink-muted">No login</span> },
  { id: 'joinDate', header: 'Joined', accessorKey: 'joinDate', cell: ({ row }) => fmtDate(row.original.joinDate) },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

const formSchema = spgCreateSchema.omit({ login: true }).extend({
  loginEmail: z.union([z.literal(''), z.email()]).optional(),
  loginPassword: z.string().optional(),
}).refine((v) => !v.loginEmail || (v.loginPassword ?? '').length >= 10, { message: 'Password ≥ 10 characters with upper, lower, digit', path: ['loginPassword'] });
type FormIn = z.input<typeof formSchema>;

function AddSpgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient(); const toast = useToast(); const router = useRouter();
  const areas = useAreas();
  const form = useForm<FormIn>({ resolver: zodResolver(formSchema), defaultValues: { category: 'REGULER', joinDate: jakartaDate() } });
  const areaId = form.watch('areaId');
  const sups = useSupervisors(areaId || undefined);
  const territories = useQuery({ queryKey: ['territories', areaId], queryFn: () => api<{ id: string; name: string }[]>('/organization/territories', { query: { parentId: areaId } }), enabled: !!areaId });
  const m = useMutation({
    mutationFn: (v: z.output<typeof formSchema>) => {
      const { loginEmail, loginPassword, ...rest } = v;
      return api<{ id: string }>('/spgs', { method: 'POST', body: { ...rest, login: loginEmail ? { email: loginEmail, password: loginPassword } : undefined } });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['spgs'] }); toast('success', 'SPG created'); onOpenChange(false); form.reset(); router.push(`/spgs/${r.id}`); },
  });
  const e = form.formState.errors;
  return <Dialog open={open} onOpenChange={onOpenChange} title="Add SPG" description="Creates the SPG master record, the initial assignment and (optionally) a login."
    footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof formSchema>))}>Create SPG</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      <Field label="Employee code" required error={e.employeeCode?.message}><Input {...form.register('employeeCode')} placeholder="SPG-0001" /></Field>
      <Field label="Full name" required error={e.fullName?.message}><Input {...form.register('fullName')} /></Field>
      <Field label="Phone" error={e.phone?.message}><Input {...form.register('phone', { setValueAs: emptyToNull })} /></Field>
      <Field label="Category" required error={e.category?.message}><Select {...form.register('category')}><option value="GROSIR">SPG Grosir</option><option value="HORECA">SPG HORECA</option><option value="REGULER">SPG Reguler</option></Select></Field>
      <Field label="Join date" required error={e.joinDate?.message}><Input type="date" {...form.register('joinDate')} /></Field>
      <Field label="Area" required error={e.areaId?.message}><Select {...form.register('areaId')}><option value="">Select area…</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.regionName})</option>)}</Select></Field>
      <Field label="Territory" error={e.territoryId?.message}><Select {...form.register('territoryId', { setValueAs: emptyToNull })} disabled={!areaId}><option value="">—</option>{(territories.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <Field label="Supervisor" error={e.supervisorId?.message}><Select {...form.register('supervisorId', { setValueAs: emptyToNull })} disabled={!areaId}><option value="">—</option>{(sups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></Field>
      <div className="sm:col-span-2 mt-1 border-t border-border pt-3 text-xs font-medium text-ink-secondary">Mobile login (optional)</div>
      <Field label="Login email" error={e.loginEmail?.message}><Input type="email" autoComplete="off" {...form.register('loginEmail')} /></Field>
      <Field label="Initial password" error={e.loginPassword?.message} hint="≥ 10 chars, upper, lower, digit"><Input type="password" autoComplete="new-password" {...form.register('loginPassword')} /></Field>
    </form>
  </Dialog>;
}

export default function SpgsPage() {
  const { can } = useAuth(); const router = useRouter();
  const { filters } = useFilters();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  return <>
    <PageHeader title="SPG Management" description="SPG master data, assignment and employment history" actions={can(PERMISSIONS.SPG_MANAGE) && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add SPG</Button>} />
    <FilterBar fields={['category', 'region', 'area', 'supervisor']} extra={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs">
      <option value="">Status: all</option>{['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED'].map((s) => <option key={s} value={s}>{s}</option>)}</Select>} />
    <Panel>
      <ServerTable<Spg> queryKey={['spgs']} endpoint="/spgs" columns={columns} sortable={['fullName', 'employeeCode', 'joinDate', 'status']} searchPlaceholder="Search name or SPG ID…"
        params={{ category: filters.category, regionId: filters.regionId, areaId: filters.areaId, supervisorId: filters.supervisorId, status: status || undefined }}
        onRowClick={(r) => router.push(`/spgs/${r.id}`)} />
    </Panel>
    {open && <AddSpgDialog open={open} onOpenChange={setOpen} />}
  </>;
}

'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { horecaProgramSchema, PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtIdr, fmtNum, fmtPct, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { SimpleTable } from '@/components/data-table';
import { Stat, StatRow } from '@/components/stat';
import { Chart, SERIES, barSeries, STATUS_COLOR } from '@/components/chart';
import { useToast } from '@/components/ui/toast';
import { errMsg } from '@/features/business/common';

type Program = { id: string; code: string; name: string; programType: string; description: string | null; startDate: string; endDate: string | null; budget: string | null; status: string; _count: { implementations: number } };
type Perf = { program: Program; implementations: { id: string; implementationDate: string; status: string; actualCost: string | null; realizationNote: string | null; validationStatus: string; outlet: { name: string; code: string }; spg: { fullName: string } }[];
  summary: { total: number; byStatus: Record<string, number>; actualCost: number; budget: number | null; budgetUtilisationPct: number | null; executedOutlets: number; salesEffect: { phase: string; value: number }[]; note: string } };
type Form = z.input<typeof horecaProgramSchema>;
const STATUS_COLORS: Record<string, string> = { EXECUTED: STATUS_COLOR.good, PARTIAL: STATUS_COLOR.warning, NOT_EXECUTED: STATUS_COLOR.critical, PLANNED: SERIES[0] };

export default function ProgramsPage() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const list = useQuery({ queryKey: ['horeca-programs'], queryFn: () => api<Program[]>('/horeca/programs') });
  const [open, setOpen] = useState(false); const [sel, setSel] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const perf = useQuery({ queryKey: ['program-perf', sel], queryFn: () => api<Perf>(`/horeca/programs/${sel}/performance`), enabled: !!sel });
  const form = useForm<Form>({ resolver: zodResolver(horecaProgramSchema), defaultValues: { programType: 'BRANDING', status: 'DRAFT' } });
  const create = useMutation({ mutationFn: (v: Form) => api('/horeca/programs', { method: 'POST', body: v }),
    onSuccess: () => { toast('success', 'Program created'); setOpen(false); form.reset(); qc.invalidateQueries({ queryKey: ['horeca-programs'] }); }, onError: (e) => setErr(errMsg(e)) });
  const status = useMutation({ mutationFn: ({ id, s }: { id: string; s: string }) => api(`/horeca/programs/${id}/status`, { method: 'PATCH', body: { status: s } }),
    onSuccess: () => { toast('success', 'Program status updated'); qc.invalidateQueries({ queryKey: ['horeca-programs'] }); }, onError: (e) => toast('error', errMsg(e)) });
  const e = form.formState.errors;
  const s = perf.data?.summary;
  return <>
    <PageHeader title="HORECA programs" description="Visibility, branding and promotional programs: execution, cost realisation and indicative effectiveness."
      actions={can(PERMISSIONS.PROGRAM_MANAGE) && <Button onClick={() => { setErr(null); setOpen(true); }}><Plus className="h-4 w-4" />New program</Button>} />
    {list.error && <ErrorBox error={list.error} />}
    <Panel>{list.isLoading ? <PanelBody><Skeleton className="h-40" /></PanelBody> :
      <SimpleTable rows={(list.data ?? []) as unknown as Record<string, unknown>[]} columns={[
        { key: 'code', label: 'Code', render: (r) => <button className="font-medium text-primary hover:underline" onClick={() => setSel(String(r.id))}>{String(r.code)}</button> },
        { key: 'name', label: 'Name' }, { key: 'programType', label: 'Type', render: (r) => humanize(r.programType) },
        { key: 'period', label: 'Period', render: (r) => `${fmtDate(r.startDate)} → ${r.endDate ? fmtDate(r.endDate) : 'open'}` },
        { key: 'budget', label: 'Budget', align: 'right', render: (r) => fmtIdr(r.budget) },
        { key: 'impl', label: 'Implementations', align: 'right', render: (r) => fmtNum((r._count as { implementations: number }).implementations) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
        { key: 'actions', label: '', render: (r) => <div className="flex justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={() => setSel(String(r.id))}>Performance</Button>
          {can(PERMISSIONS.PROGRAM_MANAGE) && r.status !== 'ACTIVE' && r.status !== 'CLOSED' && <Button size="sm" variant="secondary" loading={status.isPending} onClick={() => status.mutate({ id: String(r.id), s: 'ACTIVE' })}>Activate</Button>}
          {can(PERMISSIONS.PROGRAM_MANAGE) && r.status === 'ACTIVE' && <Button size="sm" variant="secondary" loading={status.isPending} onClick={() => status.mutate({ id: String(r.id), s: 'CLOSED' })}>Close</Button>}
        </div> }]} />}</Panel>

    <Dialog open={open} onOpenChange={setOpen} title="New HORECA program"
      footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} onClick={form.handleSubmit((v) => create.mutate({ ...v, budget: v.budget === undefined || Number.isNaN(v.budget) ? null : v.budget, endDate: v.endDate || null }))}>Create</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" required error={e.code?.message}><Input {...form.register('code')} /></Field>
        <Field label="Type" required><Select {...form.register('programType')}>{['POSM', 'DISPLAY', 'BRANDING', 'PROMOTION', 'EVENT', 'SAMPLING', 'OTHER'].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Name" required error={e.name?.message} className="sm:col-span-2"><Input {...form.register('name')} /></Field>
        <Field label="Start date" required error={e.startDate?.message}><Input type="date" {...form.register('startDate')} /></Field>
        <Field label="End date" error={e.endDate?.message}><Input type="date" {...form.register('endDate')} /></Field>
        <Field label="Budget (Rp)" error={e.budget?.message}><Input type="number" min={0} {...form.register('budget', { setValueAs: (v) => (v === '' ? null : Number(v)) })} /></Field>
        <Field label="Initial status"><Select {...form.register('status')}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option></Select></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea {...form.register('description')} /></Field>
      </div>
    </Dialog>

    <Dialog size="xl" open={!!sel} onOpenChange={(o) => !o && setSel(null)} title={perf.data ? `${perf.data.program.name}` : 'Program performance'} description={perf.data ? `${perf.data.program.code} · ${humanize(perf.data.program.programType)}` : undefined}>
      {perf.isLoading ? <Skeleton className="h-64" /> : perf.error ? <ErrorBox error={perf.error} /> : s && <>
        <StatRow cols={4}>
          <Stat label="Implementations" value={fmtNum(s.total)} sub={`${s.executedOutlets} outlets executed`} />
          <Stat label="Execution rate" value={fmtPct(s.total ? ((s.byStatus.EXECUTED ?? 0) + 0.5 * (s.byStatus.PARTIAL ?? 0)) / s.total * 100 : null)} hint="Executed + ½ partial over recorded implementations" />
          <Stat label="Actual cost" value={fmtIdr(s.actualCost, true)} sub={s.budget != null ? `of ${fmtIdr(s.budget, true)} budget` : 'no budget set'} />
          <Stat label="Budget utilisation" value={fmtPct(s.budgetUtilisationPct)} />
        </StatRow>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel><PanelHeader title="Execution by status" /><PanelBody><Chart ariaLabel="Implementations by status" height={200} empty={!s.total}
            option={{ legend: { show: false }, tooltip: { trigger: 'item' }, xAxis: { type: 'category', data: Object.keys(s.byStatus).map(humanize) }, yAxis: { type: 'value', minInterval: 1 },
              series: [barSeries('Implementations', Object.entries(s.byStatus).map(([k, v]) => ({ value: v, itemStyle: { color: STATUS_COLORS[k] ?? SERIES[0], borderRadius: [4, 4, 0, 0] } })), SERIES[0])] }}
            table={{ columns: ['Status', 'Count'], rows: Object.entries(s.byStatus).map(([k, v]) => [humanize(k), v]) }} /></PanelBody></Panel>
          <Panel><PanelHeader title="Sales of executed outlets" subtitle="30 days before start vs during program" /><PanelBody>
            <SimpleTable rows={s.salesEffect as unknown as Record<string, unknown>[]} columns={[{ key: 'phase', label: 'Phase', render: (r) => humanize(r.phase) }, { key: 'value', label: 'Approved sales value', align: 'right', render: (r) => fmtIdr(r.value) }]} />
            <p className="mt-2 rounded bg-warn-soft px-2 py-1.5 text-xs text-warn-text">{s.note}</p></PanelBody></Panel>
        </div>
        <Panel className="mt-4"><PanelHeader title="Implementations" />
          <SimpleTable rows={perf.data!.implementations as unknown as Record<string, unknown>[]} max={200} columns={[{ key: 'implementationDate', label: 'Date', render: (r) => fmtDate(r.implementationDate) },
            { key: 'outlet', label: 'Outlet', render: (r) => (r.outlet as { name: string }).name }, { key: 'spg', label: 'SPG', render: (r) => (r.spg as { fullName: string }).fullName },
            { key: 'status', label: 'Execution', render: (r) => <StatusBadge status={String(r.status)} /> }, { key: 'actualCost', label: 'Cost', align: 'right', render: (r) => fmtIdr(r.actualCost) },
            { key: 'validationStatus', label: 'Validation', render: (r) => <StatusBadge status={String(r.validationStatus)} /> }, { key: 'realizationNote', label: 'Note' }]} /></Panel>
      </>}
    </Dialog>
  </>;
}

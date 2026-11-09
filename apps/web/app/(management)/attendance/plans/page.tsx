'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { PERMISSIONS, jakartaDate } from '@tanda/shared';
import { api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDate } from '@/lib/format';
import { SimpleTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, useSpgOptions } from '@/features/ops/common';

type Plan = { id: string; plannedDate: string; status: string; note: string | null; spgId: string; spg: { fullName: string }; outlet: { id: string; name: string; code: string; channel: string; address: string | null } };

function CreatePlansDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const spgs = useSpgOptions({ status: 'ACTIVE' });
  const [spgId, setSpgId] = useState(''); const [date, setDate] = useState(jakartaDate()); const [selected, setSelected] = useState<string[]>([]); const [note, setNote] = useState('');
  const outlets = useQuery({ queryKey: ['plan-outlets', spgId], queryFn: () => apiPage<{ id: string; name: string; code: string; channel: string }>('/outlets', { query: { assignedSpgId: spgId, pageSize: 200, status: 'ACTIVE' } }), enabled: !!spgId });
  const m = useMutation({ mutationFn: () => api<{ created: number; skippedDuplicates: number }>('/visit-plans', { method: 'POST', body: { spgId, items: selected.map((outletId) => ({ outletId, plannedDate: date, note: note || null })) } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['visit-plans'] }); toast('success', `${r.created} plan(s) created${r.skippedDuplicates ? `, ${r.skippedDuplicates} already existed` : ''}`); onClose(); } });
  const list = outlets.data?.data ?? [];
  return <Dialog open onOpenChange={(o) => !o && onClose()} title="Create visit plans" size="lg"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!spgId || !selected.length} loading={m.isPending} onClick={() => m.mutate()}>Create {selected.length || ''} plan(s)</Button></>}>
    <ApiErrorBox error={m.error} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="SPG" required><Select value={spgId} onChange={(e) => { setSpgId(e.target.value); setSelected([]); }}><option value="">Select SPG…</option>{(spgs.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.category.code})</option>)}</Select></Field>
      <Field label="Planned date" required><Input type="date" value={date} min={jakartaDate()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field className="sm:col-span-2" label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[48px]" /></Field>
    </div>
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-secondary"><span>Assigned outlets {spgId ? `(${list.length})` : ''}</span>
        {list.length > 0 && <button className="text-primary hover:underline" onClick={() => setSelected(selected.length === list.length ? [] : list.map((o) => o.id))}>{selected.length === list.length ? 'Clear' : 'Select all'}</button>}</div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {!spgId ? <p className="p-4 text-center text-sm text-ink-muted">Select an SPG first</p> : outlets.isLoading ? <Skeleton className="m-3 h-20" /> : list.length === 0 ? <p className="p-4 text-center text-sm text-ink-muted">No active outlets assigned to this SPG</p>
          : list.map((o) => <label key={o.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-surface">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))} />
            <span className="font-medium">{o.name}</span><span className="text-xs text-ink-muted">{o.code} · {o.channel}</span></label>)}
      </div>
    </div>
  </Dialog>;
}

export default function PlansPage() {
  const { can } = useAuth(); const { filters } = useFilters(); const toast = useToast(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [status, setStatus] = useState('');
  const [cancel, setCancel] = useState<Plan | null>(null); const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['visit-plans', filters.from, filters.to, filters.spgId, status], queryFn: () => api<Plan[]>('/visit-plans', { query: { from: filters.from, to: filters.to, spgId: filters.spgId, status: status || undefined } }) });
  const cm = useMutation({ mutationFn: () => api(`/visit-plans/${cancel!.id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['visit-plans'] }); toast('success', 'Plan cancelled'); setCancel(null); setReason(''); } });
  const rows = q.data ?? [];
  const counts = rows.reduce<Record<string, number>>((a, p) => ({ ...a, [p.status]: (a[p.status] ?? 0) + 1 }), {});
  const manage = can(PERMISSIONS.VISIT_PLAN_MANAGE);
  return <>
    <PageHeader title="Visit plans" description="Planned vs actual visits. Past plans that were not visited become MISSED automatically." actions={manage && <Button onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" />Create plans</Button>} />
    <FilterBar fields={['dates', 'spg']} extra={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs"><option value="">Status: all</option>{['PLANNED', 'VISITED', 'MISSED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</Select>} />
    {q.error && <ErrorBox error={q.error} />}
    <Panel><PanelHeader title={`${rows.length} plan(s)`} subtitle={Object.entries(counts).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') + (rows.length >= 1000 ? ' · showing first 1000 – narrow the filter' : '')} />
      {q.isLoading ? <Skeleton className="m-4 h-40" /> : <SimpleTable rows={rows as unknown as Record<string, unknown>[]} columns={[
        { key: 'plannedDate', label: 'Date', render: (r) => fmtDate(r.plannedDate) }, { key: 'spg', label: 'SPG', render: (r) => (r.spg as Plan['spg']).fullName },
        { key: 'outlet', label: 'Outlet', render: (r) => <span><span className="font-medium">{(r.outlet as Plan['outlet']).name}</span> <span className="text-xs text-ink-muted">{(r.outlet as Plan['outlet']).code}</span></span> },
        { key: 'channel', label: 'Channel', render: (r) => (r.outlet as Plan['outlet']).channel }, { key: 'note', label: 'Note' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
        ...(manage ? [{ key: 'a', label: '', render: (r: Record<string, unknown>) => r.status === 'PLANNED' ? <Button size="sm" variant="ghost" onClick={() => setCancel(r as unknown as Plan)}>Cancel</Button> : null }] : []),
      ]} />}</Panel>
    {open && <CreatePlansDialog onClose={() => setOpen(false)} />}
    {cancel && <Dialog open onOpenChange={(o) => !o && setCancel(null)} title="Cancel visit plan" description={`${cancel.outlet.name} on ${fmtDate(cancel.plannedDate)}`}
      footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Back</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={cm.isPending} onClick={() => cm.mutate()}>Cancel plan</Button></>}>
      <ApiErrorBox error={cm.error} /><Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></Dialog>}
  </>;
}

'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { Empty, ErrorBox, PageHeader, Panel, PanelHeader, Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServerTable } from '@/components/data-table';
import { useToast } from '@/components/ui/toast';
import { MiniSelect, errMsg } from '@/features/business/common';

const TYPE_LABEL: Record<string, string> = {
  'retailer-transactions': 'Retailer transactions', 'horeca-sales': 'HORECA sales', 'outlet-orders': 'Outlet orders', availability: 'Availability checks', visibility: 'Visibility records',
  posm: 'POSM records', 'competitor-observations': 'Competitor observations', 'program-implementations': 'Program implementations', visits: 'Visits',
};
type QRow = Record<string, unknown> & { id: string; validationStatus: string; spg?: { fullName: string }; outlet?: { name: string; code: string } };

function describe(type: string, r: QRow) {
  const date = r.saleDate ?? r.orderDate ?? r.recordDate ?? r.observationDate ?? r.implementationDate ?? r.visitDate;
  const detail = type === 'horeca-sales' ? `${fmtNum(r.quantity)} ${r.unit} · ${fmtIdr(r.salesValue)}` : type === 'outlet-orders' ? `${r.orderNo} · ${fmtIdr(r.totalValue)}`
    : type === 'availability' ? (r.isAvailable ? 'Available' : `OOS – ${r.oosReason ?? 'no reason'}`) : type === 'visibility' ? `${r.companyFacing}/${r.totalCategoryFacing} facing`
    : type === 'posm' ? `${humanize(r.posmType)} – ${humanize(r.status)}${r.photoFileId ? '' : ' (no photo)'}` : type === 'competitor-observations' ? `${r.brandText ?? 'mapped brand'} · ${r.purchasePrice ? fmtIdr(r.purchasePrice) : 'no price'}`
    : type === 'program-implementations' ? `${humanize(r.status)}${r.photoFileId ? '' : ' (no photo)'}` : type === 'visits' ? `${humanize(r.geofenceStatus)} · ${r.checkInDistanceM ?? '?'} m` : '';
  return { date, detail };
}

function ReviewQueue() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['review-summary'], queryFn: () => api<Record<string, number>>('/review-queue/summary') });
  const [type, setType] = useState<string>('horeca-sales'); const [status, setStatus] = useState('');
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'APPROVED' | 'REJECTED'>(null); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['review-queue', type, status, page], queryFn: () => apiPage<QRow>(`/review-queue/${type}`, { query: { page, pageSize: 50, status: status || undefined } }), enabled: type !== 'retailer-transactions' });
  const decide = useMutation({ mutationFn: (decision: 'APPROVED' | 'REJECTED') => api<{ decided: number; skipped: number }>(`/review-queue/${type}/decision`, { method: 'POST', body: { ids: [...selected], decision, note: note || null } }),
    onSuccess: (r, d) => { toast('success', `${r.decided} record(s) ${d.toLowerCase()}${r.skipped ? `, ${r.skipped} skipped (already final)` : ''}`); setSelected(new Set()); setDialog(null); setNote(''); setErr(null);
      qc.invalidateQueries({ queryKey: ['review-queue'] }); qc.invalidateQueries({ queryKey: ['review-summary'] }); }, onError: (e) => setErr(errMsg(e)) });
  const rows = list.data?.data ?? [];
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!can(PERMISSIONS.TRANSACTION_APPROVE)) return <Empty title="You do not have approval rights" />;
  return <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
    <Panel className="h-fit"><PanelHeader title="Pending by record type" subtitle="Submitted, validated or needs review" />
      {summary.isLoading ? <Skeleton className="m-3 h-40" /> : <ul>{Object.entries(summary.data ?? {}).map(([k, n]) => <li key={k}>
        {k === 'retailer-transactions'
          ? <Link href="/grosir?status=NEEDS_REVIEW" className="flex items-center justify-between border-t border-border px-4 py-2 text-sm hover:bg-surface">{TYPE_LABEL[k]}<span className="num text-xs text-ink-secondary">{fmtNum(n)} →</span></Link>
          : <button type="button" onClick={() => { setType(k); setPage(1); setSelected(new Set()); }} className={cn('flex w-full items-center justify-between border-t border-border px-4 py-2 text-left text-sm hover:bg-surface', type === k && 'bg-primary-soft font-medium text-primary')}>
            {TYPE_LABEL[k] ?? k}<span className={cn('num rounded px-1.5 text-xs', n ? 'bg-warn-soft text-warn-text' : 'text-ink-muted')}>{fmtNum(n)}</span></button>}
      </li>)}</ul>}
      <p className="border-t border-border px-4 py-2 text-2xs text-ink-muted">Retailer transactions are reviewed individually (line items, duplicates, corrections) on their own page.</p></Panel>
    <Panel><PanelHeader title={TYPE_LABEL[type] ?? type} subtitle="Select records and approve or reject in bulk. Your own records are never approvable by you."
      actions={<><MiniSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW']} />
        <Button size="sm" variant="success" disabled={!selected.size} onClick={() => setDialog('APPROVED')}><CheckCircle2 className="h-3.5 w-3.5" />Approve ({selected.size})</Button>
        <Button size="sm" variant="danger" disabled={!selected.size} onClick={() => setDialog('REJECTED')}><XCircle className="h-3.5 w-3.5" />Reject</Button></>} />
      {list.error && <div className="p-3"><ErrorBox error={list.error} /></div>}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted"><tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
          <th className="px-3 py-2">Date</th><th className="px-3 py-2">SPG</th><th className="px-3 py-2">Outlet</th><th className="px-3 py-2">Detail</th><th className="px-3 py-2">Status</th></tr></thead>
        <tbody>{list.isLoading ? <tr><td colSpan={6} className="p-3"><Skeleton className="h-24" /></td></tr> : rows.map((r) => { const d = describe(type, r); return <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-surface/70" onClick={() => toggle(r.id)}>
          <td className="px-3 py-1.5"><input type="checkbox" aria-label="Select record" checked={selected.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
          <td className="px-3 py-1.5">{fmtDate(d.date)}</td><td className="px-3 py-1.5">{r.spg?.fullName}</td><td className="px-3 py-1.5">{r.outlet?.name}</td>
          <td className="px-3 py-1.5 text-ink-secondary">{type === 'visits' ? <Link className="text-primary hover:underline" href={`/attendance/visits/${r.id}`} onClick={(e) => e.stopPropagation()}>{d.detail}</Link> : d.detail}</td>
          <td className="px-3 py-1.5"><StatusBadge status={r.validationStatus} /></td></tr>; })}</tbody></table>
        {!list.isLoading && !rows.length && <Empty title="Nothing waiting for review" />}</div>
      {list.data && list.data.meta.totalPages > 1 && <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2 text-xs">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span>Page {page} / {list.data.meta.totalPages}</span>
        <Button size="sm" variant="secondary" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>}
    </Panel>
    <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) { setDialog(null); setErr(null); } }} title={`${dialog === 'APPROVED' ? 'Approve' : 'Reject'} ${selected.size} record(s)`}
      description={dialog === 'APPROVED' ? 'Approved records become final and count toward KPIs.' : 'Rejected records stay on file but never count.'}
      footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button variant={dialog === 'APPROVED' ? 'success' : 'danger'} loading={decide.isPending} onClick={() => decide.mutate(dialog!)}>Confirm</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      <Field label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  </div>;
}

type Approval = { id: string; entityType: string; entityId: string; requestType: string; status: string; reason: string; requestedBy?: string; decidedBy?: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string; originalSnapshot: Record<string, unknown> | null };

function ApprovalRequests() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING'); const [act, setAct] = useState<{ a: Approval; d: 'APPROVED' | 'REJECTED' } | null>(null); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null);
  const decide = useMutation({ mutationFn: () => api(`/approvals/${act!.a.id}/decision`, { method: 'POST', body: { decision: act!.d, note: note || null } }),
    onSuccess: () => { toast('success', `Request ${act!.d.toLowerCase()}`); setAct(null); setNote(''); setErr(null); qc.invalidateQueries({ queryKey: ['approvals'] }); }, onError: (e) => setErr(errMsg(e)) });
  const cols: ColumnDef<Approval, unknown>[] = [
    { id: 'createdAt', header: 'Requested', cell: ({ row }) => fmtDateTime(row.original.createdAt) },
    { id: 'type', header: 'Request', cell: ({ row }) => <div><span className="font-medium">{humanize(row.original.requestType)}</span><div className="text-2xs text-ink-muted">{row.original.entityType}</div></div> },
    { id: 'entity', header: 'Record', cell: ({ row }) => row.original.entityType === 'RetailerTransaction' ? <Link className="text-primary hover:underline" href={`/grosir/transactions/${row.original.entityId}`}>{String(row.original.originalSnapshot?.transactionNo ?? row.original.entityId.slice(0, 8))}</Link> : row.original.entityId.slice(0, 8) },
    { id: 'reason', header: 'Reason', cell: ({ row }) => <span className="text-ink-secondary">{row.original.reason}</span> },
    { id: 'by', header: 'Requested by', cell: ({ row }) => row.original.requestedBy ?? '–' },
    { id: 'status', header: 'Status', cell: ({ row }) => <div><StatusBadge status={row.original.status} />{row.original.decidedBy && <div className="text-2xs text-ink-muted">{row.original.decidedBy} · {fmtDateTime(row.original.decidedAt)}</div>}</div> },
    { id: 'actions', header: '', cell: ({ row }) => row.original.status === 'PENDING' && can(PERMISSIONS.APPROVAL_DECIDE) ? <div className="flex justify-end gap-1">
      <Button size="sm" variant="success" onClick={() => setAct({ a: row.original, d: 'APPROVED' })}>Approve</Button><Button size="sm" variant="danger" onClick={() => setAct({ a: row.original, d: 'REJECTED' })}>Reject</Button></div> : null },
  ];
  return <Panel>
    <div className="flex items-start gap-2 border-b border-border bg-primary-soft/60 px-4 py-2 text-xs text-ink-secondary"><ShieldAlert className="mt-0.5 h-4 w-4 text-primary" />
      Maker–checker: reversals and overrides take effect only after a <b>different</b> user approves them. The requester cannot approve their own request.</div>
    <ServerTable<Approval> queryKey={['approvals']} endpoint="/approvals" columns={cols} params={{ status: status || undefined }} searchable={false}
      toolbar={<MiniSelect label="Status" value={status} onChange={setStatus} options={['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']} />} />
    <Dialog open={!!act} onOpenChange={(o) => { if (!o) { setAct(null); setErr(null); } }} title={`${act?.d === 'APPROVED' ? 'Approve' : 'Reject'} ${humanize(act?.a.requestType ?? '')}`}
      description={act?.a.reason} footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button><Button variant={act?.d === 'APPROVED' ? 'success' : 'danger'} loading={decide.isPending} onClick={() => decide.mutate()}>Confirm</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      {act?.a.originalSnapshot && <pre className="mb-3 max-h-48 overflow-auto rounded bg-surface p-2 text-2xs">{JSON.stringify(act.a.originalSnapshot, null, 1)}</pre>}
      <Field label="Decision note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  </Panel>;
}

export default function ApprovalsPage() {
  const { can } = useAuth();
  return <>
    <PageHeader title="Approvals" description="Human validation layer: raw and validated records become final only after approval." />
    <Tabs defaultValue={can(PERMISSIONS.TRANSACTION_APPROVE) ? 'queue' : 'requests'}>
      <TabsList>{can(PERMISSIONS.TRANSACTION_APPROVE) && <TabsTrigger value="queue">Review queue</TabsTrigger>}{can(PERMISSIONS.APPROVAL_READ) && <TabsTrigger value="requests">Approval requests</TabsTrigger>}</TabsList>
      <TabsContent value="queue"><ReviewQueue /></TabsContent>
      <TabsContent value="requests"><ApprovalRequests /></TabsContent>
    </Tabs>
  </>;
}

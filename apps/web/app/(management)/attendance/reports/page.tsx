'use client';
import { Fragment, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtDateTime, fmtPct, humanize } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox } from '@/features/ops/common';

type Report = { id: string; reportDate: string; channel: string; summary: string | null; issues: string | null; content: Record<string, unknown> | null; status: string; submittedAt: string | null; isLate: boolean;
  completenessScore: string | null; reviewNote: string | null; reviewedAt: string | null; spg: { fullName: string; employeeCode: string; category: { code: string } } };

function ReviewDialog({ report, decision, onClose }: { report: Report; decision: 'APPROVED' | 'REVISION_REQUIRED'; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const [note, setNote] = useState('');
  const m = useMutation({ mutationFn: () => api(`/daily-reports/${report.id}/review`, { method: 'POST', body: { decision, note: note || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['daily-reports'] }); toast('success', decision === 'APPROVED' ? 'Report approved' : 'Revision requested – SPG notified'); onClose(); } });
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={decision === 'APPROVED' ? 'Approve report' : 'Request revision'} description={`${report.spg.fullName} · ${fmtDate(report.reportDate)}`}
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={decision === 'APPROVED' ? 'success' : 'primary'} disabled={decision === 'REVISION_REQUIRED' && note.trim().length < 3} loading={m.isPending} onClick={() => m.mutate()}>{decision === 'APPROVED' ? 'Approve' : 'Send back'}</Button></>}>
    <ApiErrorBox error={m.error} /><Field label={decision === 'APPROVED' ? 'Note (optional)' : 'What needs to be revised?'} required={decision !== 'APPROVED'}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field></Dialog>;
}

export default function DailyReportsPage() {
  const { can } = useAuth(); const { filters } = useFilters();
  const [status, setStatus] = useState(''); const [late, setLate] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState<{ r: Report; d: 'APPROVED' | 'REVISION_REQUIRED' } | null>(null);
  const canReview = can(PERMISSIONS.REPORT_REVIEW);
  const columns: ColumnDef<Report, unknown>[] = [
    { id: 'x', header: '', cell: ({ row }) => open === row.original.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> },
    { id: 'date', header: 'Date', cell: ({ row }) => fmtDate(row.original.reportDate) },
    { id: 'spg', header: 'SPG', cell: ({ row }) => <span className="font-medium">{row.original.spg.fullName}</span> },
    { id: 'cat', header: 'Form', cell: ({ row }) => <Badge>{row.original.spg.category.code}</Badge> },
    { id: 'sub', header: 'Submitted', cell: ({ row }) => <span>{fmtDateTime(row.original.submittedAt)} {row.original.isLate && <Badge tone="warn" icon>Late</Badge>}</span> },
    { id: 'comp', header: 'Completeness', meta: { align: 'right' }, cell: ({ row }) => fmtPct(row.original.completenessScore) },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'act', header: '', cell: ({ row }) => canReview && row.original.status === 'SUBMITTED' ? <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="success" onClick={() => setReview({ r: row.original, d: 'APPROVED' })}>Approve</Button>
      <Button size="sm" variant="secondary" onClick={() => setReview({ r: row.original, d: 'REVISION_REQUIRED' })}>Revise</Button></span> : null },
  ];
  return <>
    <PageHeader title="Daily reports" description="Each SPG category submits its own report form. Late = submitted after the configured deadline." />
    <FilterBar fields={['dates', 'spg']} extra={<>
      <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs"><option value="">Status: all</option>{['DRAFT', 'SUBMITTED', 'REVISION_REQUIRED', 'APPROVED'].map((s) => <option key={s}>{s}</option>)}</Select>
      <Select aria-label="Late" value={late} onChange={(e) => setLate(e.target.value)} className="h-8 w-auto text-xs"><option value="">Timeliness: all</option><option value="true">Late only</option><option value="false">On time only</option></Select></>} />
    <Panel>
      <ServerTable<Report> queryKey={['daily-reports']} endpoint="/daily-reports" columns={columns} searchable={false}
        params={{ from: filters.from, to: filters.to, spgId: filters.spgId, status: status || undefined, isLate: late || undefined }}
        onRowClick={(r) => setOpen((o) => (o === r.id ? null : r.id))} />
    </Panel>
    {open && <ReportContent id={open} />}
    {review && <ReviewDialog report={review.r} decision={review.d} onClose={() => setReview(null)} />}
  </>;
}

/** Expanded channel-specific content of the selected report (fetched from the cached page). */
function ReportContent({ id }: { id: string }) {
  const qc = useQueryClient();
  const all = qc.getQueriesData<{ data: Report[] }>({ queryKey: ['daily-reports'] }).flatMap(([, d]) => d?.data ?? []);
  const r = all.find((x) => x.id === id);
  if (!r) return null;
  return <Panel className="mt-3 p-4">
    <div className="mb-2 text-sm font-semibold">{r.spg.fullName} · {fmtDate(r.reportDate)} · {humanize(r.channel)} form</div>
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(r.content ?? {}).map(([k, v]) => <Fragment key={k}><div><dt className="text-xs text-ink-muted">{humanize(k.replace(/([A-Z])/g, '_$1'))}</dt><dd className="whitespace-pre-line">{v == null || v === '' ? '–' : String(v)}</dd></div></Fragment>)}
    </dl>
    {r.summary && <p className="mt-3 whitespace-pre-line text-sm"><span className="text-xs text-ink-muted">Summary: </span>{r.summary}</p>}
    {r.issues && <p className="mt-1 whitespace-pre-line text-sm"><span className="text-xs text-ink-muted">Issues: </span>{r.issues}</p>}
    {r.reviewNote && <p className="mt-2 rounded bg-surface px-3 py-2 text-sm"><span className="text-xs text-ink-muted">Reviewer note ({fmtDateTime(r.reviewedAt)}): </span>{r.reviewNote}</p>}
  </Panel>;
}

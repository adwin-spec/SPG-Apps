'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtDateTime, fmtNum, fmtPct, humanize } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { Stat, StatRow } from '@/components/stat';
import { Input } from '@/components/ui/input';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { SimpleTable } from '@/components/data-table';
import { ListPanel, type Row } from '@/features/analytics/common';

interface Ops {
  date: string; notCheckedIn: Row[]; missedVisits: Row[]; missingReportsYesterday: Row[]; lateReports: Row[]; incompleteReports: Row[];
  pendingReview: { type: string; n: number }[]; pendingApprovals: number; ocrStatus: { status: string; n: number }[];
  duplicates: { kind: string; type: string; n: number }[]; failedSync: { kind: string; n: number }[]; outsideGeofence: Row[]; overrides: { entity_type: string; n: number }[];
}
const REVIEW_LINK: Record<string, string> = { retailer_transactions: '/approvals?type=retailer-transactions', outlet_orders: '/approvals?type=outlet-orders', horeca_sales: '/approvals?type=horeca-sales', daily_reports: '/attendance/reports', visits_needs_review: '/approvals?type=visits' };

export default function OperationalPage() {
  const { filters } = useFilters();
  const [date, setDate] = useState(jakartaDate());
  const q = useQuery({ queryKey: ['operational', filters, date], queryFn: () => api<Ops>('/analytics/operational', { query: { ...filters, date } }), refetchInterval: 120_000 });
  const d = q.data;
  const sum = (xs?: { n: number }[]) => (xs ?? []).reduce((a, x) => a + Number(x.n), 0);
  const ocr = Object.fromEntries((d?.ocrStatus ?? []).map((o) => [o.status, Number(o.n)]));
  return <>
    <PageHeader title="Operational monitoring" description="Exceptions that need action today. Refreshes every 2 minutes." />
    <FilterBar extra={<label className="flex items-center gap-1 text-xs text-ink-secondary">Day<Input type="date" aria-label="Monitoring date" value={date} max={jakartaDate()} onChange={(e) => setDate(e.target.value || jakartaDate())} className="h-8 w-[9.5rem] text-xs" /></label>} />
    {q.error && <ErrorBox error={q.error} />}
    <StatRow cols={6}>
      <Stat loading={q.isLoading} label="Not checked in" value={fmtNum(d?.notCheckedIn.length)} sub={d && `on ${fmtDate(d.date)}`} />
      <Stat loading={q.isLoading} label="Missed visits" value={fmtNum(d?.missedVisits.length)} sub="in period / overdue plans" />
      <Stat loading={q.isLoading} label="Missing reports" value={fmtNum(d?.missingReportsYesterday.length)} sub="yesterday" />
      <Stat loading={q.isLoading} label="Pending review" value={fmtNum(sum(d?.pendingReview))} sub={d && `${d.pendingApprovals} approval requests`} href="/approvals" />
      <Stat loading={q.isLoading} label="OCR needs review" value={fmtNum(ocr.NEEDS_REVIEW ?? 0)} sub={`${ocr.SYNC_FAILED ?? 0} failed`} href="/integrations" />
      <Stat loading={q.isLoading} label="Outside geofence" value={fmtNum(d?.outsideGeofence.length)} sub="awaiting review" />
    </StatRow>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <ListPanel title="SPG not checked in" subtitle="Active SPG without attendance on the selected day" rows={d?.notCheckedIn ?? []}
        columns={[{ key: 'full_name', label: 'SPG', render: (r) => <Link className="text-primary hover:underline" href={`/spgs/${r.id}`}>{String(r.full_name)}</Link> }, { key: 'category', label: 'Cat.' }, { key: 'supervisor', label: 'Supervisor', render: (r) => String(r.supervisor ?? '–') }]} />
      <ListPanel title="Missed visits" subtitle="Plans marked missed or overdue" rows={d?.missedVisits ?? []}
        columns={[{ key: 'planned_date', label: 'Date', render: (r) => fmtDate(r.planned_date) }, { key: 'spg', label: 'SPG' }, { key: 'outlet', label: 'Outlet' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> }]} />
      <ListPanel title="Missing daily reports" subtitle="Attended yesterday, no submitted report" rows={d?.missingReportsYesterday ?? []}
        columns={[{ key: 'full_name', label: 'SPG' }, { key: 'work_date', label: 'Work date', render: (r) => fmtDate(r.work_date) }]} />
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <ListPanel title="Late reports" subtitle="Submitted after the configured deadline" rows={d?.lateReports ?? []}
        columns={[{ key: 'full_name', label: 'SPG' }, { key: 'report_date', label: 'Report date', render: (r) => fmtDate(r.report_date) }, { key: 'submitted_at', label: 'Submitted', render: (r) => fmtDateTime(r.submitted_at) }]} />
      <ListPanel title="Incomplete reports" subtitle="Completeness below 100%" rows={d?.incompleteReports ?? []}
        columns={[{ key: 'full_name', label: 'SPG' }, { key: 'report_date', label: 'Date', render: (r) => fmtDate(r.report_date) }, { key: 'completeness_score', label: 'Complete', align: 'right', render: (r) => fmtPct(r.completeness_score) }]} />
      <ListPanel title="Outside-geofence visits" subtitle="Check-in beyond the outlet radius" rows={d?.outsideGeofence ?? []}
        columns={[{ key: 'spg', label: 'SPG' }, { key: 'outlet', label: 'Outlet', render: (r) => <Link className="text-primary hover:underline" href={`/attendance/visits/${r.id}`}>{String(r.outlet)}</Link> }, { key: 'check_in_distance_m', label: 'Distance', align: 'right', render: (r) => `${fmtNum(r.check_in_distance_m)} m` }]} />
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Panel><PanelHeader title="Pending review" subtitle="Records awaiting validation" />
        <SimpleTable rows={(d?.pendingReview ?? []) as unknown as Row[]} columns={[{ key: 'type', label: 'Type', render: (r) => <Link className="text-primary hover:underline" href={REVIEW_LINK[String(r.type)] ?? '/approvals'}>{humanize(r.type)}</Link> }, { key: 'n', label: 'Count', align: 'right', render: (r) => fmtNum(r.n) }]} />
        <PanelBody className="border-t border-border py-2 text-xs"><Link className="text-primary hover:underline" href="/approvals">{d?.pendingApprovals ?? 0} reversal / override approvals pending →</Link></PanelBody></Panel>
      <Panel><PanelHeader title="OCR pipeline" subtitle="Paper forms by status" />
        <SimpleTable rows={(d?.ocrStatus ?? []) as unknown as Row[]} columns={[{ key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> }, { key: 'n', label: 'Files', align: 'right', render: (r) => fmtNum(r.n) }]} /></Panel>
      <Panel><PanelHeader title="Duplicates" subtitle="Flagged, never auto-deleted" />
        <SimpleTable rows={(d?.duplicates ?? []) as unknown as Row[]} columns={[{ key: 'kind', label: 'Source', render: (r) => humanize(r.kind) }, { key: 'type', label: 'Type', render: (r) => <StatusBadge status={String(r.type)} /> }, { key: 'n', label: 'Count', align: 'right' }]} /></Panel>
      <Panel><PanelHeader title="Sync & overrides" subtitle="Failed synchronisation (7 days) and supervisor overrides in period" />
        <SimpleTable rows={[...(d?.failedSync ?? []).map((f) => ({ item: `Failed ${humanize(f.kind).toLowerCase()}`, n: f.n })), ...(d?.overrides ?? []).map((o) => ({ item: `Overrides: ${o.entity_type}`, n: o.n }))]} columns={[{ key: 'item', label: 'Item' }, { key: 'n', label: 'Count', align: 'right' }]} /></Panel>
    </div>
  </>;
}

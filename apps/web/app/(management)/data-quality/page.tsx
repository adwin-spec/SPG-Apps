'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ScanSearch } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDateTime, fmtDec, fmtNum, fmtPct, humanize } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { ExportMenu } from '@/components/export-menu';
import { Chart, SERIES, STATUS_COLOR, barSeries } from '@/components/chart';
import { ServerTable, SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';

type Summary = { filter: { from: string; to: string }; score: number | null; dimensions: Record<string, number | null>; measures: Record<string, number | null>;
  byRule: { ruleCode: string; severity: string; dimension: string; _count: number }[]; bySpg: { id: string; full_name: string; open_issues: number; critical: number }[];
  layers: { entity: string; status: string; n: number }[] };
type Issue = { id: string; ruleCode: string; dimension: string; entityType: string; entityId: string; severity: string; message: string; status: string; detectedAt: string };
const DIMS = ['COMPLETENESS', 'VALIDITY', 'UNIQUENESS', 'CONSISTENCY', 'TIMELINESS'];
const MEASURES: Record<string, string> = { report_completeness: 'Avg daily-report completeness', outlet_gps_pct: 'Outlets with GPS', tx_priced_pct: 'Transactions fully priced', tx_valid_pct: 'Transactions passing validation',
  visit_inside_pct: 'Visits inside geofence', tx_unique_pct: 'Transactions not flagged duplicate', tx_consistent_pct: 'Retailer–wholesaler link consistent', visit_closed_pct: 'Visits properly closed', report_on_time_pct: 'Reports on time' };
const LAYERS = [{ k: 'raw', label: 'Raw (submitted)', st: ['SUBMITTED'] }, { k: 'val', label: 'Validated', st: ['VALIDATED'] }, { k: 'rev', label: 'Needs review', st: ['NEEDS_REVIEW'] }, { k: 'app', label: 'Approved', st: ['APPROVED'] }, { k: 'rej', label: 'Rejected / superseded / reversed', st: ['REJECTED', 'SUPERSEDED', 'REVERSED'] }];
const scoreColor = (v: number | null) => (v == null ? '#9ca3af' : v >= 90 ? STATUS_COLOR.good : v >= 70 ? STATUS_COLOR.warning : STATUS_COLOR.critical);
const scoreStatus = (v: number | null) => (v == null ? null : v >= 90 ? 'GOOD' : v >= 70 ? 'WATCH' : 'CRITICAL');

export default function DataQualityPage() {
  const { filters } = useFilters();
  const { can } = useAuth(); const manage = can(PERMISSIONS.DATA_QUALITY_MANAGE); const toast = useToast(); const qc = useQueryClient();
  const [iq, setIq] = useState<{ status: string; severity: string; dimension: string }>({ status: 'OPEN', severity: '', dimension: '' });
  const q = useQuery({ queryKey: ['dq-summary', filters], queryFn: () => api<Summary>('/data-quality/summary', { query: filters }) });
  const scan = useMutation({ mutationFn: () => api<{ findings: Record<string, number>; durationMs: number }>('/data-quality/scan', { method: 'POST' }),
    onSuccess: (r) => { toast('success', `Scan finished: ${Object.values(r.findings).reduce((a, b) => a + b, 0)} findings in ${r.durationMs} ms`); qc.invalidateQueries({ queryKey: ['dq-summary'] }); qc.invalidateQueries({ queryKey: ['dq-issues'] }); },
    onError: (e) => toast('error', (e as Error).message) });
  const upd = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/data-quality/issues/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: () => { toast('success', 'Issue updated'); qc.invalidateQueries({ queryKey: ['dq-issues'] }); qc.invalidateQueries({ queryKey: ['dq-summary'] }); }, onError: (e) => toast('error', (e as Error).message) });
  const d = q.data;
  const entities = [...new Set((d?.layers ?? []).map((l) => l.entity))];
  const layerCount = (e: string, st: string[]) => (d?.layers ?? []).filter((l) => l.entity === e && st.includes(l.status)).reduce((a, l) => a + Number(l.n), 0);
  const columns: ColumnDef<Issue, unknown>[] = [
    { id: 'severity', header: 'Severity', cell: ({ row }) => <StatusBadge status={row.original.severity} /> },
    { id: 'rule', header: 'Rule', cell: ({ row }) => <span className="font-mono text-xs">{row.original.ruleCode}</span> },
    { id: 'dimension', header: 'Dimension', cell: ({ row }) => humanize(row.original.dimension) },
    { id: 'entity', header: 'Entity', cell: ({ row }) => <span className="text-xs">{row.original.entityType} <span className="text-ink-muted">{row.original.entityId.slice(0, 8)}</span></span> },
    { id: 'message', header: 'Message', cell: ({ row }) => <span className="text-xs">{row.original.message}</span> },
    { id: 'detected', header: 'Detected', cell: ({ row }) => <span className="text-xs">{fmtDateTime(row.original.detectedAt)}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: 'actions', header: '', cell: ({ row }) => manage ? <div className="flex justify-end gap-1">{row.original.status === 'OPEN'
      ? <><Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: row.original.id, status: 'RESOLVED' })}>Resolve</Button><Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: row.original.id, status: 'IGNORED' })}>Ignore</Button></>
      : <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: row.original.id, status: 'OPEN' })}>Reopen</Button>}</div> : null },
  ];
  return <>
    <PageHeader title="Data quality" description="Completeness, validity, uniqueness, consistency and timeliness of field data. Raw data is never changed by corrections."
      actions={<>{manage && <Button variant="secondary" loading={scan.isPending} onClick={() => scan.mutate()}><ScanSearch className="h-4 w-4" />Run scan</Button>}<ExportMenu report="data-quality" filters={filters} /></>} />
    <FilterBar fields={['dates', 'category', 'region', 'area', 'supervisor', 'spg']} />
    {q.error && <ErrorBox error={q.error} />}
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel><PanelHeader title="Data Quality Score" subtitle="Mean of the five dimensions" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-56" /> : <>
          <div className="flex items-end gap-3"><span className="num text-5xl font-semibold leading-none">{fmtDec(d?.score)}</span><span className="pb-1 text-sm text-ink-muted">/ 100</span>
            <span className="pb-1"><StatusBadge status={scoreStatus(d?.score ?? null)} /></span></div>
          <Chart ariaLabel="Score per data-quality dimension" height={190}
            option={{ legend: { show: false }, grid: { left: 8, right: 36, top: 16, bottom: 0, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => fmtDec(v) },
              xAxis: { type: 'value', min: 0, max: 100 }, yAxis: { type: 'category', inverse: true, data: DIMS.map(humanize) },
              series: [barSeries('Score', DIMS.map((k) => ({ value: d?.dimensions[k] ?? null, itemStyle: { color: scoreColor(d?.dimensions[k] ?? null), borderRadius: [0, 4, 4, 0] } })), SERIES[0], { label: { show: true, position: 'right', color: '#4b5563', formatter: (p: { value: number }) => fmtDec(p.value) } })] }}
            table={{ columns: ['Dimension', 'Score'], rows: DIMS.map((k) => [humanize(k), fmtDec(d?.dimensions[k])]) }} /></>}</PanelBody></Panel>
      <Panel><PanelHeader title="Measures" subtitle={d ? `${d.filter.from} – ${d.filter.to}` : undefined} />
        <SimpleTable rows={Object.entries(MEASURES).map(([k, label]) => ({ label, v: d?.measures[k] ?? null }))} columns={[{ key: 'label', label: 'Measure' }, { key: 'v', label: 'Value', align: 'right', render: (r) => fmtPct(r.v) }]} /></Panel>
      <Panel><PanelHeader title="Open issues by rule" />
        <div className="max-h-[330px] overflow-y-auto"><SimpleTable rows={(d?.byRule ?? []) as unknown as Record<string, unknown>[]} columns={[{ key: 'ruleCode', label: 'Rule', render: (r) => <span className="font-mono text-xs">{String(r.ruleCode)}</span> },
          { key: 'severity', label: 'Severity', render: (r) => <StatusBadge status={String(r.severity)} /> }, { key: '_count', label: 'Open', align: 'right', render: (r) => fmtNum(r._count) }]} /></div></Panel>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel className="xl:col-span-2"><PanelHeader title="Data layers: RAW → VALIDATED → APPROVED" subtitle="Only the approved layer feeds final KPIs; raw records are kept unchanged" />
        <SimpleTable rows={entities.map((e) => { const total = LAYERS.reduce((a, l) => a + layerCount(e, l.st), 0); return { entity: humanize(e), total, ...Object.fromEntries(LAYERS.map((l) => [l.k, layerCount(e, l.st)])) } as Record<string, unknown>; })}
          columns={[{ key: 'entity', label: 'Records' }, ...LAYERS.map((l) => ({ key: l.k, label: l.label, align: 'right' as const, render: (r: Record<string, unknown>) => fmtNum(r[l.k]) })),
            { key: 'appr', label: 'Approved %', align: 'right', render: (r) => fmtPct(Number(r.total) ? (Number(r.app) / Number(r.total)) * 100 : null) }]} /></Panel>
      <Panel><PanelHeader title="SPG with most open issues" />
        <SimpleTable rows={(d?.bySpg ?? []).filter((s) => Number(s.open_issues) > 0) as unknown as Record<string, unknown>[]} max={10} columns={[{ key: 'full_name', label: 'SPG' }, { key: 'open_issues', label: 'Open', align: 'right' }, { key: 'critical', label: 'Critical', align: 'right' }]} /></Panel>
    </div>
    <Panel className="mt-4"><PanelHeader title="Issue register" subtitle="Detected by scheduled rule scans; resolving an issue does not modify the underlying record" />
      <ServerTable queryKey={['dq-issues']} endpoint="/data-quality/issues" columns={columns} searchPlaceholder="Search message…"
        params={{ status: iq.status || undefined, severity: iq.severity || undefined, dimension: iq.dimension || undefined }}
        toolbar={<>
          <Select aria-label="Status" value={iq.status} onChange={(e) => setIq({ ...iq, status: e.target.value })} className="h-8 w-auto text-xs"><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="IGNORED">Ignored</option></Select>
          <Select aria-label="Severity" value={iq.severity} onChange={(e) => setIq({ ...iq, severity: e.target.value })} className="h-8 w-auto text-xs"><option value="">Severity: all</option><option>CRITICAL</option><option>WARNING</option><option>INFO</option></Select>
          <Select aria-label="Dimension" value={iq.dimension} onChange={(e) => setIq({ ...iq, dimension: e.target.value })} className="h-8 w-auto text-xs"><option value="">Dimension: all</option>{DIMS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>
        </>} /></Panel>
  </>;
}

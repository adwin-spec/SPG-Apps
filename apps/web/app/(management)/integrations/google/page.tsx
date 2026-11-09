'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight, CloudDownload, Sheet } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { ServerTable, SimpleTable } from '@/components/data-table';
import { useToast } from '@/components/ui/toast';
import { MiniSelect, errMsg } from '@/features/business/common';

type Job = { id: string; integration: string; jobType: string; status: string; startedAt: string | null; finishedAt: string | null; stats: Record<string, unknown> | null; error: string | null; createdAt: string; logs: { id: string; level: string; message: string; createdAt: string }[] };
interface Status { googleConfigured: boolean; driveFolderConfigured: boolean; sheetsConfigured: boolean; ocrProvider: string; drivePollCron: string; queuesEnabled: boolean;
  lastDriveSync: Job | null; lastSheetsSync: Job | null; mapping: Record<string, { sheet: string; columns: Record<string, string> }>; fileLogStatus: Record<string, number> }

function Flag({ ok, label, hint, offLabel = 'Not configured' }: { ok: boolean; label: string; hint: string; offLabel?: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><div className="min-w-0"><div className="font-medium">{label}</div><div className="break-all text-xs text-ink-muted">{hint}</div></div>
    <span className="shrink-0"><StatusBadge status={ok ? 'OK' : offLabel === 'Manual' ? 'NO_DATA' : 'MISSING'} label={ok ? 'Configured' : offLabel} /></span></div>;
}
function JobLogs({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open}>
    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{job.logs.length} log line(s)</button>
    {open && <ul className="mt-1 space-y-0.5 text-2xs">{job.logs.map((l) => <li key={l.id}><StatusBadge status={l.level} /> {l.message}</li>)}</ul>}</div>;
}
const cols: ColumnDef<Job, unknown>[] = [
  { id: 'createdAt', header: 'Started', cell: ({ row }) => fmtDateTime(row.original.startedAt ?? row.original.createdAt) },
  { id: 'integration', header: 'Integration', cell: ({ row }) => humanize(row.original.integration) },
  { id: 'jobType', header: 'Job', cell: ({ row }) => row.original.jobType },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { id: 'stats', header: 'Result', cell: ({ row }) => row.original.error ? <span className="text-xs text-critical-text">{row.original.error}</span> : <span className="text-xs text-ink-secondary">{row.original.stats ? Object.entries(row.original.stats).filter(([k]) => k !== 'cursor').map(([k, v]) => `${k}: ${v}`).join(' · ') : '–'}</span> },
  { id: 'logs', header: 'Logs', cell: ({ row }) => <JobLogs job={row.original} /> },
];

export default function GoogleIntegrationPage() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const st = useQuery({ queryKey: ['integration-status'], queryFn: () => api<Status>('/integrations/status') });
  const logs = useQuery({ queryKey: ['integration-logs'], queryFn: () => api<{ id: string; level: string; message: string; createdAt: string }[]>('/integrations/logs') });
  const [integration, setIntegration] = useState('');
  const run = useMutation({ mutationFn: (kind: 'drive' | 'sheets') => api(`/integrations/${kind}/sync`, { method: 'POST' }),
    onSuccess: () => { toast('success', 'Sync job queued'); qc.invalidateQueries({ queryKey: ['sync-jobs'] }); qc.invalidateQueries({ queryKey: ['integration-status'] }); }, onError: (e) => toast('error', errMsg(e)) });
  const s = st.data; const manage = can(PERMISSIONS.INTEGRATION_MANAGE);
  const driveReady = !!s?.googleConfigured && !!s?.driveFolderConfigured; const sheetsReady = !!s?.googleConfigured && !!s?.sheetsConfigured;
  return <>
    <PageHeader title="Google Drive & Sheets" description="Drive and Sheets are integration sources and mirrors only. PostgreSQL remains the system of record."
      actions={manage && <>
        <Button variant="secondary" disabled={!driveReady} loading={run.isPending && run.variables === 'drive'} onClick={() => run.mutate('drive')} title={driveReady ? undefined : 'Configure service account and Drive folder first'}><CloudDownload className="h-4 w-4" />Sync Drive</Button>
        <Button variant="secondary" disabled={!sheetsReady} loading={run.isPending && run.variables === 'sheets'} onClick={() => run.mutate('sheets')} title={sheetsReady ? undefined : 'Configure service account and spreadsheet first'}><Sheet className="h-4 w-4" />Sync Sheets</Button></>} />
    {st.error && <ErrorBox error={st.error} />}
    {s && (!driveReady || !sheetsReady) && <div className="mb-3 rounded-md border border-amber-200 bg-warn-soft px-3 py-2 text-sm text-warn-text">Sync buttons are disabled until the server environment provides <code>GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code>, <code>GOOGLE_DRIVE_INBOX_FOLDER_ID</code> and <code>GOOGLE_SHEETS_SPREADSHEET_ID</code> (credentials are never stored in the app or database). Paper forms can still be uploaded directly in <Link className="underline" href="/integrations">OCR review</Link>.</div>}
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel><PanelHeader title="Configuration" /><PanelBody>{st.isLoading ? <Skeleton className="h-40" /> : s && <>
        <Flag ok={s.googleConfigured} label="Service account" hint="GOOGLE_SERVICE_ACCOUNT_JSON_BASE64" />
        <Flag ok={s.driveFolderConfigured} label="Drive inbox folder" hint={`Polled ${s.drivePollCron} (Asia/Jakarta) by the worker`} />
        <Flag ok={s.sheetsConfigured} label="Spreadsheet" hint="FILE_LOG / OCR_RAW / INPUT_HARIAN / TRANSACTION_DB" />
        <Flag ok={s.ocrProvider !== 'none'} label={`OCR provider: ${s.ocrProvider}`} hint={s.ocrProvider === 'none' ? 'Manual transcription in review screen' : 'Automatic text extraction (still human-reviewed)'} offLabel="Manual" />
        <Flag ok={s.queuesEnabled} label="Background queue" hint="BullMQ worker processes OCR and syncs" /></>}</PanelBody></Panel>
      <Panel><PanelHeader title="Last runs" /><PanelBody>{s && ['lastDriveSync', 'lastSheetsSync'].map((k) => { const j = s[k as 'lastDriveSync']; return <div key={k} className="border-b border-border py-2 text-sm last:border-0">
        <div className="flex items-center justify-between"><span className="font-medium">{k === 'lastDriveSync' ? 'Drive' : 'Sheets'}</span>{j ? <StatusBadge status={j.status} /> : <span className="text-xs text-ink-muted">never run</span>}</div>
        {j && <div className="text-xs text-ink-muted">{fmtDateTime(j.finishedAt ?? j.startedAt)}{j.error ? ` · ${j.error}` : ''}</div>}</div>; })}
        <div className="mt-3 text-xs font-semibold uppercase text-ink-muted">Paper forms by status</div>
        <div className="mt-1 flex flex-wrap gap-1">{s && Object.entries(s.fileLogStatus).map(([k, v]) => <span key={k} className="text-xs"><StatusBadge status={k} label={`${humanize(k)} ${v}`} /></span>)}</div></PanelBody></Panel>
      <Panel><PanelHeader title="Recent integration log" /><div className="max-h-72 overflow-y-auto">{logs.data?.length ? <ul>{logs.data.slice(0, 50).map((l) => <li key={l.id} className="border-t border-border px-4 py-1.5 text-xs">
        <StatusBadge status={l.level} /> <span className="text-ink-muted">{fmtDateTime(l.createdAt)}</span><div className="mt-0.5">{l.message}</div></li>)}</ul> : <p className="p-4 text-sm text-ink-muted">No log entries.</p>}</div></Panel>
    </div>
    <Panel className="mt-4"><PanelHeader title="Sheet & column mapping" subtitle="Rename sheets or columns in System Settings → integrations.googleSheets.mapping – no code change needed" actions={<Link href="/settings" className="text-xs text-primary hover:underline">Edit in settings →</Link>} />
      <SimpleTable rows={s ? Object.entries(s.mapping).map(([k, v]) => ({ key: k, sheet: v.sheet, columns: Object.entries(v.columns).map(([f, c]) => `${f} → "${c}"`).join(' · ') })) : []}
        columns={[{ key: 'key', label: 'Dataset' }, { key: 'sheet', label: 'Sheet name' }, { key: 'columns', label: 'Field → column' }]} /></Panel>
    <Panel className="mt-4"><PanelHeader title="Sync jobs" />
      <ServerTable<Job> queryKey={['sync-jobs']} endpoint="/integrations/sync-jobs" columns={cols} params={{ integration: integration || undefined }} searchable={false}
        toolbar={<MiniSelect label="Integration" value={integration} onChange={setIntegration} options={['GOOGLE_DRIVE', 'GOOGLE_SHEETS']} />} emptyHint="No sync has run yet." /></Panel>
  </>;
}

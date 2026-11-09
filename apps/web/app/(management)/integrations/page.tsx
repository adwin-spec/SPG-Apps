'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Upload } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtNum, fmtPct, humanize } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { Stat, StatRow } from '@/components/stat';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { ErrorBox, PageHeader, Panel } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { MiniSelect, errMsg, useOutletOptions, useSpgOptions } from '@/features/business/common';

type FL = { id: string; formId: string | null; status: string; duplicateType: string; attempts: number; lastError: string | null; reportDate: string | null; createdAt: string;
  file: { originalName: string; mimeType: string; source: string; sizeBytes: number }; ocrRaw: { confidence: string | null; provider: string }[] };
const STATUSES = ['UPLOADED', 'PROCESSING', 'OCR_COMPLETED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SYNC_FAILED'];
const cols: ColumnDef<FL, unknown>[] = [
  { id: 'createdAt', header: 'Received', cell: ({ row }) => fmtDateTime(row.original.createdAt) },
  { id: 'file', header: 'File', cell: ({ row }) => <div><div className="font-medium text-primary">{row.original.file.originalName}</div><div className="text-2xs text-ink-muted">{row.original.file.source === 'GOOGLE_DRIVE' ? 'Google Drive' : 'App upload'} · {Math.round(row.original.file.sizeBytes / 1024)} KB</div></div> },
  { id: 'formId', header: 'Form ID', cell: ({ row }) => row.original.formId ?? '–' },
  { id: 'reportDate', header: 'Report date', cell: ({ row }) => fmtDate(row.original.reportDate) },
  { id: 'ocr', header: 'OCR', cell: ({ row }) => { const r = row.original.ocrRaw[0]; return r ? <span className="text-xs">{r.provider}{r.confidence != null && ` · ${fmtPct(Number(r.confidence) * 100)}`}</span> : '–'; } },
  { id: 'dup', header: 'Duplicate', cell: ({ row }) => row.original.duplicateType === 'NONE' ? '–' : <StatusBadge status={row.original.duplicateType} /> },
  { id: 'status', header: 'Status', cell: ({ row }) => <div><StatusBadge status={row.original.status} />{row.original.lastError && <div className="max-w-[16rem] truncate text-2xs text-critical-text" title={row.original.lastError}>{row.original.lastError}</div>}</div> },
  { id: 'attempts', header: 'Attempts', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.attempts) },
];

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null); const [meta, setMeta] = useState({ formId: '', spgId: '', wholesalerOutletId: '', reportDate: '' }); const [err, setErr] = useState<string | null>(null);
  const spgs = useSpgOptions('GROSIR'); const ws = useOutletOptions('WHOLESALER');
  const up = useMutation({ mutationFn: async () => { const fd = new FormData(); fd.append('file', file!); Object.entries(meta).forEach(([k, v]) => v && fd.append(k, v)); return api<{ fileLogId: string; duplicate: { type: string } }>('/ocr/uploads', { method: 'POST', body: fd }); },
    onSuccess: (r) => { toast(r.duplicate.type === 'NONE' ? 'success' : 'info', r.duplicate.type === 'NONE' ? 'Uploaded – OCR queued' : `Uploaded and flagged: ${humanize(r.duplicate.type)}`); qc.invalidateQueries({ queryKey: ['file-logs'] }); qc.invalidateQueries({ queryKey: ['ocr-counts'] }); setFile(null); onClose(); },
    onError: (e) => setErr(errMsg(e)) });
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Upload paper form" description="Photo (JPEG/PNG/WebP) or PDF. The original file is kept; OCR output always goes to human review."
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!file} loading={up.isPending} onClick={() => { setErr(null); up.mutate(); }}>Upload</Button></>}>
    {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="File" required className="sm:col-span-2"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="py-1.5" /></Field>
      <Field label="Form ID" hint="Used for re-upload detection"><Input value={meta.formId} onChange={(e) => setMeta({ ...meta, formId: e.target.value })} /></Field>
      <Field label="Report date"><Input type="date" value={meta.reportDate} onChange={(e) => setMeta({ ...meta, reportDate: e.target.value })} /></Field>
      <Field label="SPG"><MiniSelect label="SPG" value={meta.spgId} onChange={(v) => setMeta({ ...meta, spgId: v })} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.employeeCode})` }))} /></Field>
      <Field label="Wholesaler"><MiniSelect label="Grosir" value={meta.wholesalerOutletId} onChange={(v) => setMeta({ ...meta, wholesalerOutletId: v })} options={(ws.data?.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
    </div>
  </Dialog>;
}

export default function OcrQueuePage() {
  const router = useRouter(); const { can } = useAuth();
  const [status, setStatus] = useState(''); const [dup, setDup] = useState(''); const [open, setOpen] = useState(false);
  const counts = useQuery({ queryKey: ['ocr-counts'], queryFn: () => api<Record<string, number>>('/ocr/file-logs/status-counts'), refetchInterval: 15_000 });
  const c = counts.data ?? {};
  return <>
    <PageHeader title="OCR review – paper forms" description="Google Drive / uploaded photos → OCR → human review → approval. Nothing becomes a transaction until a second person approves it."
      actions={can(PERMISSIONS.OCR_REVIEW) && <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload form</Button>} />
    <StatRow cols={6}>
      {['NEEDS_REVIEW', 'PROCESSING', 'UPLOADED', 'SYNC_FAILED', 'APPROVED', 'REJECTED'].map((s) => <Stat key={s} loading={counts.isLoading} label={humanize(s)} value={fmtNum(c[s] ?? 0)}
        sub={s === 'SYNC_FAILED' && c[s] ? <Badge tone="critical">retry needed</Badge> : s === 'NEEDS_REVIEW' && c[s] ? <Badge tone="warn">awaiting review</Badge> : undefined} />)}
    </StatRow>
    <Panel className="mt-4"><ServerTable<FL> queryKey={['file-logs']} endpoint="/ocr/file-logs" columns={cols} params={{ status: status || undefined, duplicateType: dup || undefined }}
      searchPlaceholder="Form ID or file name…" onRowClick={(r) => router.push(`/integrations/${r.id}`)}
      toolbar={<><MiniSelect label="Status" value={status} onChange={setStatus} options={STATUSES} /><MiniSelect label="Duplicate" value={dup} onChange={setDup} options={['NONE', 'EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE', 'RE_UPLOAD', 'CORRECTED_SUBMISSION']} /></>} /></Panel>
    <UploadDialog open={open} onClose={() => setOpen(false)} />
  </>;
}

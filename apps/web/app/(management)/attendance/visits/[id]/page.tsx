'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PERMISSIONS, visitOverrideSchema } from '@tanda/shared';
import { api, blobUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, fmtPct, humanize } from '@/lib/format';
import { PageHeader, Panel, PanelBody, PanelHeader, ErrorBox, Skeleton, Empty } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, Details, emptyToUndef } from '@/features/ops/common';

type R = Record<string, unknown>;
type VisitDetail = R & { id: string; spgId: string; visitDate: string; checkInAt: string; checkOutAt: string | null; durationMin: number | null; channel: string; isPlanned: boolean; geofenceStatus: string; checkInDistanceM: number | null;
  checkInLat: string | null; checkInLng: string | null; checkInAccuracyM: number | null; checkOutLat: string | null; checkOutLng: string | null; status: string; validationStatus: string; purpose: string | null; outcome: string | null; notes: string | null;
  picMet: string | null; followUpAction: string | null; orderStatus: string | null; source: string; clientRecordedAt: string | null; overrideReason: string | null;
  spg: { id: string; fullName: string; employeeCode: string }; outlet: { id: string; name: string; code: string; channel: string };
  evidence: { id: string; evidenceType: string; caption: string | null; file: { id: string; mimeType: string; originalName: string } }[]; horecaVisit: R | null; wholesaleReport: R | null; visitPlan: R | null;
  records: { transactions: R[]; orders: R[]; horecaSales: R[]; competitorObservations: R[]; availability: R[]; visibility: R[]; posm: R[]; programs: R[]; wholesaleObservations: R[] } };

function Evidence({ e }: { e: VisitDetail['evidence'][number] }) {
  const [url, setUrl] = useState<string | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { let u: string | null = null; blobUrl(`/files/${e.file.id}/content`).then((x) => { u = x; setUrl(x); }).catch(() => setErr(true)); return () => { if (u) URL.revokeObjectURL(u); }; }, [e.file.id]);
  return <figure className="overflow-hidden rounded-md border border-border">
    {e.file.mimeType.startsWith('image/') ? (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={e.caption ?? e.evidenceType} className="h-40 w-full object-cover" /></a> : <div className="flex h-40 items-center justify-center bg-surface text-xs text-ink-muted">{err ? 'Not available' : 'Loading…'}</div>)
      : <div className="flex h-40 items-center justify-center bg-surface text-xs">{url ? <a className="text-primary underline" href={url} target="_blank" rel="noreferrer">{e.file.originalName}</a> : '…'}</div>}
    <figcaption className="px-2 py-1 text-2xs text-ink-secondary"><Badge>{e.evidenceType}</Badge> {e.caption}</figcaption></figure>;
}

function OverrideDialog({ v, onClose }: { v: VisitDetail; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const form = useForm<z.input<typeof visitOverrideSchema>>({ resolver: zodResolver(visitOverrideSchema), defaultValues: { reason: '' } });
  const m = useMutation({ mutationFn: (b: z.output<typeof visitOverrideSchema>) => api(`/visits/${v.id}/override`, { method: 'POST', body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['visit', v.id] }); toast('success', 'Override saved and audited'); onClose(); } });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title="Supervisor override" description="Marks the visit as reviewed (APPROVED). The reason is stored in the audit trail."
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((b) => m.mutate(b as z.output<typeof visitOverrideSchema>))}>Save override</Button></>}>
    <ApiErrorBox error={m.error} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Geofence status"><Select {...form.register('geofenceStatus', { setValueAs: emptyToUndef })}><option value="">Keep ({v.geofenceStatus})</option>{['INSIDE', 'OUTSIDE', 'UNKNOWN'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <Field label="Visit status"><Select {...form.register('status', { setValueAs: emptyToUndef })}><option value="">Keep ({v.status})</option>{['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <Field className="sm:col-span-2" label="Reason" required error={e.reason?.message}><Textarea {...form.register('reason')} /></Field>
    </div>
  </Dialog>;
}

const name = (r: R, k: string, f: string) => ((r[k] as R | null)?.[f] as string) ?? '–';

export default function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { can } = useAuth();
  const [override, setOverride] = useState(false);
  const q = useQuery({ queryKey: ['visit', id], queryFn: () => api<VisitDetail>(`/visits/${id}`) });
  const v = q.data;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!v) return <Skeleton className="h-64" />;
  const r = v.records;
  const total = Object.values(r).reduce((a, x) => a + x.length, 0);
  const gps = (lat: unknown, lng: unknown) => lat && lng ? <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</a> : '–';
  const section = (title: string, rows: R[], columns: { key: string; label: string; align?: 'right'; render?: (row: R) => React.ReactNode }[]) => rows.length ? <Panel className="mt-4"><PanelHeader title={`${title} (${rows.length})`} /><SimpleTable rows={rows} columns={columns} /></Panel> : null;
  return <>
    <PageHeader title={`Visit · ${v.outlet.name}`} description={`${v.spg.fullName} · ${fmtDate(v.visitDate)} · ${v.channel}`} actions={<>
      <Button asChild variant="secondary"><Link href={`/outlets/${v.outlet.id}`}>Outlet</Link></Button>
      <Button asChild variant="secondary"><Link href={`/spgs/${v.spg.id}`}>SPG</Link></Button>
      {can(PERMISSIONS.ATTENDANCE_OVERRIDE) && <Button onClick={() => setOverride(true)}>Override</Button>}</>} />
    <Panel><PanelHeader title="Check-in / check-out" actions={<><StatusBadge status={v.status} /><StatusBadge status={v.validationStatus} /></>} />
      <PanelBody><Details items={[
        ['Check-in (WIB)', fmtDateTime(v.checkInAt)], ['Check-out (WIB)', fmtDateTime(v.checkOutAt)], ['Duration', v.durationMin != null ? `${v.durationMin} min` : 'Open'],
        ['Check-in GPS', gps(v.checkInLat, v.checkInLng)], ['GPS accuracy', v.checkInAccuracyM != null ? `${v.checkInAccuracyM} m` : '–'],
        ['Geofence', <span key="g" className="inline-flex items-center gap-1"><StatusBadge status={v.geofenceStatus} />{v.checkInDistanceM != null && <span className="text-xs text-ink-muted">{v.checkInDistanceM} m from outlet</span>}</span>],
        ['Check-out GPS', gps(v.checkOutLat, v.checkOutLng)], ['Plan', v.isPlanned ? <Badge key="p" tone="info">Planned</Badge> : <Badge key="p">Unplanned</Badge>], ['Source', `${v.source}${v.clientRecordedAt ? ` · device ${fmtDateTime(v.clientRecordedAt)}` : ''}`],
        ['Purpose', v.purpose], ['PIC met', v.picMet], ['Order status', v.orderStatus ? humanize(v.orderStatus) : '–'],
        ['Outcome', v.outcome], ['Follow-up', v.followUpAction], ['Override', v.overrideReason ?? '–'],
      ]} />{v.notes && <p className="mt-3 whitespace-pre-line rounded bg-surface px-3 py-2 text-sm">{v.notes}</p>}</PanelBody></Panel>
    {v.horecaVisit && <Panel className="mt-4"><PanelHeader title="HORECA visit detail" /><PanelBody><Details items={[['Purpose', humanize(v.horecaVisit.visitPurpose)], ['PIC role', String(v.horecaVisit.picRole ?? '–')], ['Result', String(v.horecaVisit.result ?? '–')], ['Next follow-up', fmtDate(v.horecaVisit.nextFollowUpDate)]]} /></PanelBody></Panel>}
    {v.wholesaleReport && <Panel className="mt-4"><PanelHeader title="Wholesale report" /><PanelBody><Details items={[['Reported retailers', fmtNum(v.wholesaleReport.reportedRetailerCount)], ['Stock notes', String(v.wholesaleReport.stockNotes ?? '–')], ['Market notes', String(v.wholesaleReport.marketNotes ?? '–')]]} /></PanelBody></Panel>}
    <Panel className="mt-4"><PanelHeader title={`Evidence photos (${v.evidence.length})`} />
      <PanelBody>{v.evidence.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{v.evidence.map((e) => <Evidence key={e.id} e={e} />)}</div> : <Empty title="No photos attached" />}</PanelBody></Panel>
    {total === 0 && <Panel className="mt-4"><Empty title="No business records were captured during this visit" /></Panel>}
    {section('Retailer transactions', r.transactions, [{ key: 'transactionNo', label: 'Transaction', render: (x) => <Link className="text-primary hover:underline" href={`/grosir/transactions/${x.id}`}>{String(x.transactionNo)}</Link> },
      { key: 'retailer', label: 'Retailer', render: (x) => name(x, 'retailer', 'name') }, { key: 'dataNature', label: 'Nature' }, { key: 'items', label: 'Lines', align: 'right', render: (x) => (x.items as R[]).length },
      { key: 'totalValue', label: 'Total', align: 'right', render: (x) => fmtIdr(x.totalValue) }, { key: 'validationStatus', label: 'Status', render: (x) => <StatusBadge status={String(x.validationStatus)} /> }])}
    {section('Orders', r.orders, [{ key: 'orderNo', label: 'Order' }, { key: 'status', label: 'Order status' }, { key: 'items', label: 'Lines', align: 'right', render: (x) => (x.items as R[]).length },
      { key: 'totalValue', label: 'Total', align: 'right', render: (x) => fmtIdr(x.totalValue) }, { key: 'validationStatus', label: 'Validation', render: (x) => <StatusBadge status={String(x.validationStatus)} /> }])}
    {section('HORECA sales', r.horecaSales, [{ key: 'sku', label: 'SKU', render: (x) => name(x, 'productVariant', 'sku') }, { key: 'quantity', label: 'Qty', align: 'right', render: (x) => fmtNum(x.quantity) },
      { key: 'salesValue', label: 'Value', align: 'right', render: (x) => fmtIdr(x.salesValue) }, { key: 'isRepeatOrder', label: 'Repeat', render: (x) => (x.isRepeatOrder ? 'Yes' : 'No') }, { key: 'validationStatus', label: 'Status', render: (x) => <StatusBadge status={String(x.validationStatus)} /> }])}
    {section('Competitor observations', r.competitorObservations, [{ key: 'brand', label: 'Brand', render: (x) => name(x, 'brand', 'name') !== '–' ? name(x, 'brand', 'name') : String(x.brandText ?? '–') },
      { key: 'purchasePrice', label: 'Purchase price', align: 'right', render: (x) => fmtIdr(x.purchasePrice) }, { key: 'sellingPrice', label: 'Selling price', align: 'right', render: (x) => fmtIdr(x.sellingPrice) },
      { key: 'stockAvailability', label: 'Stock', render: (x) => <StatusBadge status={String(x.stockAvailability)} /> }, { key: 'promotionDetail', label: 'Promotion' }, { key: 'validationStatus', label: 'Status', render: (x) => <StatusBadge status={String(x.validationStatus)} /> }])}
    {section('Availability', r.availability, [{ key: 'sku', label: 'SKU', render: (x) => name(x, 'productVariant', 'sku') }, { key: 'isAvailable', label: 'Available', render: (x) => (x.isAvailable ? <Badge tone="good" icon>Yes</Badge> : <Badge tone="critical" icon>OOS</Badge>) },
      { key: 'stockQuantity', label: 'Stock', align: 'right', render: (x) => fmtNum(x.stockQuantity) }, { key: 'oosReason', label: 'OOS reason' }])}
    {section('Visibility', r.visibility, [{ key: 'companyFacing', label: 'Company facing', align: 'right' }, { key: 'competitorFacing', label: 'Competitor facing', align: 'right' }, { key: 'totalCategoryFacing', label: 'Total', align: 'right' },
      { key: 'shareOfShelfPct', label: 'SoS', align: 'right', render: (x) => fmtPct(x.shareOfShelfPct) }, { key: 'hasDisplay', label: 'Display', render: (x) => (x.hasDisplay ? 'Yes' : 'No') }])}
    {section('POSM', r.posm, [{ key: 'posmType', label: 'Type' }, { key: 'status', label: 'Status', render: (x) => <StatusBadge status={String(x.status)} /> }, { key: 'quantity', label: 'Qty', align: 'right' }, { key: 'notes', label: 'Notes' }])}
    {section('Program implementations', r.programs, [{ key: 'program', label: 'Program', render: (x) => name(x, 'program', 'name') }, { key: 'status', label: 'Status', render: (x) => <StatusBadge status={String(x.status)} /> },
      { key: 'actualCost', label: 'Cost', align: 'right', render: (x) => fmtIdr(x.actualCost) }, { key: 'realizationNote', label: 'Realization' }])}
    {section('Wholesale observations', r.wholesaleObservations, [{ key: 'sku', label: 'SKU', render: (x) => name(x, 'productVariant', 'sku') }, { key: 'stockQuantity', label: 'Stock', align: 'right', render: (x) => fmtNum(x.stockQuantity) },
      { key: 'stockAvailability', label: 'Availability', render: (x) => <StatusBadge status={String(x.stockAvailability)} /> }, { key: 'buyPrice', label: 'Buy', align: 'right', render: (x) => fmtIdr(x.buyPrice) }, { key: 'sellPrice', label: 'Sell', align: 'right', render: (x) => fmtIdr(x.sellPrice) }, { key: 'restockFrequency', label: 'Restock' }])}
    {override && <OverrideDialog v={v} onClose={() => setOverride(false)} />}
  </>;
}

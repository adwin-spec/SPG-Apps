'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { fmtDate, fmtNum, fmtPct } from '@/lib/format';
import { MiniSelect, useSpgOptions } from '@/features/business/common';

type V = { id: string; recordDate: string; companyFacing: number; competitorFacing: number; totalCategoryFacing: number; shareOfShelfPct: string | null; hasDisplay: boolean; displayType: string | null; hasPromotion: boolean; photoFileId: string | null; validationStatus: string;
  outlet: { name: string }; spg: { fullName: string } };
const cols: ColumnDef<V, unknown>[] = [
  { id: 'recordDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.recordDate) },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => row.original.outlet.name },
  { id: 'company', header: 'Company facing', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.companyFacing) },
  { id: 'competitor', header: 'Competitor facing', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.competitorFacing) },
  { id: 'total', header: 'Total category', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.totalCategoryFacing) },
  { id: 'sos', header: 'Share of Shelf', meta: { align: 'right' }, cell: ({ row }) => row.original.shareOfShelfPct == null ? <span className="text-xs italic text-ink-muted">n/a – no category facing</span> : <span className="font-medium">{fmtPct(row.original.shareOfShelfPct)}</span> },
  { id: 'display', header: 'Display / promo', cell: ({ row }) => <div className="flex gap-1">{row.original.hasDisplay && <Badge tone="info">{row.original.displayType ?? 'Display'}</Badge>}{row.original.hasPromotion && <Badge tone="good">Promo</Badge>}{!row.original.hasDisplay && !row.original.hasPromotion && '–'}</div> },
  { id: 'photo', header: 'Photo', cell: ({ row }) => row.original.photoFileId ? <Badge tone="good">Yes</Badge> : <Badge tone="warn">None</Badge> },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'status', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
];
export default function VisibilityPage() {
  const [f, setF] = useState({ from: '', to: '', spgId: '' });
  const spgs = useSpgOptions('REGULER');
  return <>
    <PageHeader title="Visibility & Share of Shelf" description="Share of Shelf = company facing ÷ total category facing × 100. Records with zero category facing have no share (not 0%)."
      actions={<ExportMenu report="visibility" filters={{ category: 'REGULER', from: f.from || undefined, to: f.to || undefined, spgId: f.spgId || undefined }} />} />
    <Panel><ServerTable<V> queryKey={['regular-visibility']} endpoint="/regular/visibility" columns={cols} params={Object.fromEntries(Object.entries(f).filter(([, v]) => v))} searchable={false}
      toolbar={<div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <MiniSelect label="SPG" value={f.spgId} onChange={(v) => setF({ ...f, spgId: v })} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
      </div>} /></Panel>
  </>;
}

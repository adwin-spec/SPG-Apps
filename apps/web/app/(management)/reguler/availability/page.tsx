'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { fmtDate, fmtNum } from '@/lib/format';
import { MiniSelect, useSpgOptions } from '@/features/business/common';

type A = { id: string; recordDate: string; isAvailable: boolean; stockQuantity: string | null; oosReason: string | null; lastRestockDate: string | null; validationStatus: string; outlet: { name: string }; productVariant: { sku: string; name: string } };
const cols: ColumnDef<A, unknown>[] = [
  { id: 'recordDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.recordDate) },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => row.original.outlet.name },
  { id: 'sku', header: 'SKU', cell: ({ row }) => <div>{row.original.productVariant.sku}<div className="text-2xs text-ink-muted">{row.original.productVariant.name}</div></div> },
  { id: 'avail', header: 'Availability', cell: ({ row }) => row.original.isAvailable ? <StatusBadge status="IN_STOCK" label="Available" /> : <StatusBadge status="OUT_OF_STOCK" label="Out of stock" /> },
  { id: 'stock', header: 'Stock', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.stockQuantity) },
  { id: 'reason', header: 'OOS reason', cell: ({ row }) => row.original.oosReason ? <Badge tone="serious">{row.original.oosReason}</Badge> : '–' },
  { id: 'restock', header: 'Last restock', cell: ({ row }) => fmtDate(row.original.lastRestockDate) },
  { id: 'status', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
];
export default function AvailabilityPage() {
  const [f, setF] = useState({ from: '', to: '', spgId: '' });
  const spgs = useSpgOptions('REGULER');
  return <>
    <PageHeader title="Availability" description="SKU-level availability checks at regular outlets, with out-of-stock reasons." actions={<ExportMenu report="availability" filters={{ category: 'REGULER', from: f.from || undefined, to: f.to || undefined, spgId: f.spgId || undefined }} />} />
    <Panel><ServerTable<A> queryKey={['regular-availability']} endpoint="/regular/availability" columns={cols} params={Object.fromEntries(Object.entries(f).filter(([, v]) => v))} searchable={false}
      toolbar={<div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <MiniSelect label="SPG" value={f.spgId} onChange={(v) => setF({ ...f, spgId: v })} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
      </div>} /></Panel>
  </>;
}

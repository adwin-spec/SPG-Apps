'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { fmtDate, fmtIdr, fmtNum } from '@/lib/format';
import { MiniSelect, NatureBadge, useSpgOptions } from '@/features/business/common';

type S = { id: string; saleDate: string; quantity: string; unit: string; unitPrice: string | null; salesValue: string | null; isOrder: boolean; isRepeatOrder: boolean; dataNature: string; validationStatus: string; stockQuantity: string | null;
  outlet: { name: string; code: string }; productVariant: { sku: string; name: string }; spg: { fullName: string } };
const cols: ColumnDef<S, unknown>[] = [
  { id: 'saleDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.saleDate) },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => <div>{row.original.outlet.name}<div className="text-2xs text-ink-muted">{row.original.outlet.code}</div></div> },
  { id: 'sku', header: 'SKU', cell: ({ row }) => <div>{row.original.productVariant.sku}<div className="text-2xs text-ink-muted">{row.original.productVariant.name}</div></div> },
  { id: 'qty', header: 'Qty', meta: { align: 'right' }, cell: ({ row }) => `${fmtNum(row.original.quantity)} ${row.original.unit}` },
  { id: 'price', header: 'Price', meta: { align: 'right' }, cell: ({ row }) => row.original.unitPrice == null ? <Badge tone="warn">missing</Badge> : fmtIdr(row.original.unitPrice) },
  { id: 'value', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => fmtIdr(row.original.salesValue) },
  { id: 'type', header: 'Type', cell: ({ row }) => <div className="flex gap-1">{row.original.isOrder ? <Badge tone="info">Order</Badge> : <Badge>Sell-out</Badge>}{row.original.isRepeatOrder && <Badge tone="good">Repeat</Badge>}</div> },
  { id: 'stock', header: 'Stock', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.stockQuantity) },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'nature', header: 'Nature', cell: ({ row }) => <NatureBadge nature={row.original.dataNature} /> },
  { id: 'status', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
];
export default function HorecaSalesPage() {
  const [f, setF] = useState({ from: '', to: '', status: '', spgId: '' });
  const spgs = useSpgOptions('HORECA');
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  return <>
    <PageHeader title="SPG HORECA – sales & orders" description="Product sales, orders and repeat orders per HORECA outlet. Only APPROVED ACTUAL lines count toward KPIs."
      actions={<ExportMenu report="horeca-performance" filters={{ from: f.from || undefined, to: f.to || undefined, spgId: f.spgId || undefined, category: 'HORECA' }} />} />
    <Panel><ServerTable<S> queryKey={['horeca-sales']} endpoint="/horeca/sales" columns={cols} params={params} searchable={false}
      toolbar={<div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <MiniSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED']} />
        <MiniSelect label="SPG" value={f.spgId} onChange={(v) => setF({ ...f, spgId: v })} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
      </div>} /></Panel>
  </>;
}

'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { fmtDate, fmtIdr, fmtNum } from '@/lib/format';
import { MiniSelect, NatureBadge, useSpgOptions } from '@/features/business/common';

type O = { id: string; orderNo: string; orderDate: string; status: string; isRestock: boolean; totalQuantity: string; totalValue: string; dataNature: string; validationStatus: string;
  outlet: { name: string; code: string }; spg: { fullName: string }; items: { lineNo: number; quantity: string; unit: string; unitPrice: string; lineTotal: string; productVariant: { sku: string; name: string } }[] };

function Items({ o }: { o: O }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" onClick={(e) => { e.stopPropagation(); setOpen((x) => !x); }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" aria-expanded={open}>
    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{o.items.length} item(s)</button>
    {open && <ul className="mt-1 space-y-0.5 text-2xs text-ink-secondary">{o.items.map((i) => <li key={i.lineNo}>{i.productVariant.sku} · {fmtNum(i.quantity)} {i.unit} × {fmtIdr(i.unitPrice)} = {fmtIdr(i.lineTotal)}</li>)}</ul>}</div>;
}
const cols: ColumnDef<O, unknown>[] = [
  { id: 'orderNo', header: 'Order', cell: ({ row }) => <span className="font-medium">{row.original.orderNo}</span> },
  { id: 'orderDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.orderDate) },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => row.original.outlet.name },
  { id: 'items', header: 'Items', cell: ({ row }) => <Items o={row.original} /> },
  { id: 'qty', header: 'Qty', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.totalQuantity) },
  { id: 'value', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => fmtIdr(row.original.totalValue) },
  { id: 'status', header: 'Order status', cell: ({ row }) => <div className="flex gap-1"><Badge tone="info">{row.original.status.toLowerCase()}</Badge>{row.original.isRestock && <Badge>Restock</Badge>}</div> },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'nature', header: 'Nature', cell: ({ row }) => <NatureBadge nature={row.original.dataNature} /> },
  { id: 'validation', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
];
export default function RegulerOrdersPage() {
  const [f, setF] = useState({ from: '', to: '', status: '', spgId: '' });
  const spgs = useSpgOptions('REGULER');
  return <>
    <PageHeader title="SPG Reguler – orders" description="Outlet orders with line detail. Cancelled orders and non-approved records do not count as sales."
      actions={<ExportMenu report="sales-achievement" filters={{ category: 'REGULER', spgId: f.spgId || undefined, from: f.from || undefined, to: f.to || undefined }} />} />
    <Panel><ServerTable<O> queryKey={['regular-orders']} endpoint="/regular/orders" columns={cols} params={Object.fromEntries(Object.entries(f).filter(([, v]) => v))} searchable={false}
      toolbar={<div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <Input type="date" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8 w-[9.5rem] text-xs" />
        <MiniSelect label="Validation" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED']} />
        <MiniSelect label="SPG" value={f.spgId} onChange={(v) => setF({ ...f, spgId: v })} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
      </div>} /></Panel>
  </>;
}

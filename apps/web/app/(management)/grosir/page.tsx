'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { fmtDate, fmtIdr, fmtNum } from '@/lib/format';
import { MiniSelect, NatureBadge, SourceBadge, useSpgOptions } from '@/features/business/common';

type Tx = { id: string; transactionNo: string; transactionDate: string; dataNature: string; source: string; validationStatus: string; duplicateType: string; totalValue: string; totalQuantity: string;
  retailer: { name: string; code: string }; wholesaler: { name: string } | null; spg: { fullName: string }; items: unknown[] };

const cols: ColumnDef<Tx, unknown>[] = [
  { id: 'transactionNo', header: 'Transaction', cell: ({ row }) => <span className="whitespace-nowrap font-medium text-primary">{row.original.transactionNo}</span> },
  { id: 'transactionDate', header: 'Date', cell: ({ row }) => <span className="whitespace-nowrap">{fmtDate(row.original.transactionDate)}</span> },
  { id: 'retailer', header: 'Retailer', cell: ({ row }) => <div><div>{row.original.retailer.name}</div><div className="text-2xs text-ink-muted">{row.original.retailer.code}</div></div> },
  { id: 'wholesaler', header: 'Grosir', cell: ({ row }) => row.original.wholesaler?.name ?? '–' },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'lines', header: 'Lines', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.items.length) },
  { id: 'totalValue', header: 'Value', meta: { align: 'right' }, cell: ({ row }) => <span className="whitespace-nowrap">{fmtIdr(row.original.totalValue)}</span> },
  { id: 'nature', header: 'Nature', cell: ({ row }) => <NatureBadge nature={row.original.dataNature} /> },
  { id: 'status', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
  { id: 'dup', header: 'Duplicate', cell: ({ row }) => row.original.duplicateType === 'NONE' ? <span className="text-ink-muted">–</span> : <StatusBadge status={row.original.duplicateType} /> },
  { id: 'source', header: 'Source', cell: ({ row }) => <SourceBadge source={row.original.source} /> },
];

export default function GrosirTransactionsPage() {
  const router = useRouter(); const sp = useSearchParams();
  const [f, setF] = useState<Record<string, string>>({ status: sp.get('status') ?? '', dataNature: '', duplicateType: '', source: '', spgId: '', from: '', to: '' });
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const spgs = useSpgOptions('GROSIR');
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  return <>
    <PageHeader title="SPG Grosir – retailer transactions" description="Every transaction with its line items, validation layer (raw → validated → approved), data nature and duplicate classification. Only APPROVED ACTUAL records count in KPIs."
      actions={<ExportMenu report="retailer-transactions" filters={{ from: f.from || undefined, to: f.to || undefined, spgId: f.spgId || undefined, category: 'GROSIR' }} />} />
    <Panel>
      <ServerTable<Tx> queryKey={['retailer-transactions']} endpoint="/retailer-transactions" columns={cols} params={params} sortable={['transactionDate', 'totalValue', 'createdAt']}
        searchPlaceholder="Transaction no. or retailer…" onRowClick={(r) => router.push(`/grosir/transactions/${r.id}`)}
        toolbar={<div className="flex flex-wrap items-center gap-2">
          <Input type="date" aria-label="From" value={f.from} onChange={(e) => set('from')(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
          <Input type="date" aria-label="To" value={f.to} onChange={(e) => set('to')(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
          <MiniSelect label="Status" value={f.status} onChange={set('status')} options={['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVERSED']} />
          <MiniSelect label="Nature" value={f.dataNature} onChange={set('dataNature')} options={['ACTUAL', 'ESTIMATE', 'OBSERVATION']} />
          <MiniSelect label="Duplicate" value={f.duplicateType} onChange={set('duplicateType')} options={['NONE', 'EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE', 'CORRECTED_SUBMISSION']} />
          <MiniSelect label="Source" value={f.source} onChange={set('source')} options={['MANUAL', 'OFFLINE_SYNC', 'OCR', 'IMPORT']} />
          <MiniSelect label="SPG" value={f.spgId} onChange={set('spgId')} options={(spgs.data?.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
        </div>} />
    </Panel>
  </>;
}

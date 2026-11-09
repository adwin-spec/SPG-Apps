'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtIdr, fmtNum, humanize } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';

type Obs = { id: string; observationDate: string; channel: string; brandText?: string; skuText?: string; variant?: string; purchasePrice?: string; sellingPrice?: string; stockAvailability: string;
  quantityPurchased?: string; facing?: number; hasPromotion?: boolean; promotionDetail?: string; validationStatus: string; brand?: { name: string }; competitorProduct?: { name: string; variant?: string }; outlet: { name: string; code: string }; spg: { fullName: string } };

const columns: ColumnDef<Obs, unknown>[] = [
  { id: 'date', header: 'Date', cell: ({ row }) => fmtDate(row.original.observationDate) },
  { id: 'channel', header: 'Channel', cell: ({ row }) => humanize(row.original.channel) },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => <span>{row.original.outlet.name} <span className="text-2xs text-ink-muted">{row.original.outlet.code}</span></span> },
  { id: 'brand', header: 'Brand', cell: ({ row }) => row.original.brand?.name ?? <span>{row.original.brandText} <Badge tone="warn">unmapped</Badge></span> },
  { id: 'product', header: 'Product', cell: ({ row }) => row.original.competitorProduct ? `${row.original.competitorProduct.name} ${row.original.competitorProduct.variant ?? ''}` : row.original.skuText ?? '–' },
  { id: 'buy', header: 'Buy price', meta: { align: 'right' }, cell: ({ row }) => fmtIdr(row.original.purchasePrice) },
  { id: 'sell', header: 'Sell price', meta: { align: 'right' }, cell: ({ row }) => fmtIdr(row.original.sellingPrice) },
  { id: 'qty', header: 'Qty bought', meta: { align: 'right' }, cell: ({ row }) => fmtNum(row.original.quantityPurchased) },
  { id: 'stock', header: 'Stock', cell: ({ row }) => <StatusBadge status={row.original.stockAvailability} /> },
  { id: 'promo', header: 'Promotion', cell: ({ row }) => row.original.hasPromotion ? <span className="text-xs">{row.original.promotionDetail ?? 'Yes'}</span> : '–' },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'status', header: 'Validation', cell: ({ row }) => <StatusBadge status={row.original.validationStatus} /> },
];

export default function ObservationsPage() {
  const { filters } = useFilters();
  return <>
    <PageHeader title="Competitor observations" description="Raw field intelligence from all three SPG categories" actions={<ExportMenu report="competitor-intelligence" filters={filters} />} />
    <FilterBar fields={['dates', 'spg', 'brand']} />
    <Panel><ServerTable queryKey={['competitor-observations']} endpoint="/competitor-observations" columns={columns} searchable={false}
      params={{ from: filters.from, to: filters.to, spgId: filters.spgId, brandId: filters.brandId }} /></Panel>
  </>;
}

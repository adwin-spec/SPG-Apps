'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, humanize } from '@/lib/format';
import { Chart, SERIES_COLOR, barSeries } from '@/components/chart';
import { SimpleTable } from '@/components/data-table';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { KV, NatureBadge } from '@/features/business/common';

type Row = Record<string, unknown>;
interface Hist { retailer: { id: string; code: string; name: string; status: string; address: string | null; picName: string | null; phone: string | null; firstRecordedAt: string; district: { name: string }; subdistrict: { name: string } | null; category: { name: string } | null;
  retailerLinks: { id: string; relationType: string; effectiveFrom: string; effectiveTo: string | null; wholesaler: { id: string; name: string; code: string } }[] };
  transactions: (Row & { id: string; transactionNo: string; transactionDate: string; dataNature: string; validationStatus: string; totalValue: string; wholesaler: { name: string } | null; spg: { fullName: string } })[];
  monthly: { month: string; owner: string; qty: number; value: number; tx: number }[]; competitorObservations: (Row & { brand: { name: string } | null })[]; masterDataHistory: { id: string; action: string; createdAt: string; reason: string | null; after: unknown }[] }

export default function RetailerHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ['retailer-history', id], queryFn: () => api<Hist>(`/wholesale/retailers/${id}/history`) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { retailer: r, transactions, monthly, competitorObservations, masterDataHistory } = q.data;
  const months = [...new Set(monthly.map((m) => m.month))];
  const val = (m: string, o: string) => monthly.find((x) => x.month === m && x.owner === o)?.value ?? 0;
  return <>
    <Link href="/grosir/retailers" className="mb-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ArrowLeft className="h-3 w-3" />Retailers</Link>
    <PageHeader title={r.name} description={`${r.code} · ${r.category?.name ?? 'Retailer'} · ${r.district.name}${r.subdistrict ? ` / ${r.subdistrict.name}` : ''}`} />
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel><PanelHeader title="Master data" /><PanelBody><dl className="grid grid-cols-2 gap-3">
        <KV k="Status" v={<StatusBadge status={r.status} />} /><KV k="First recorded" v={fmtDate(r.firstRecordedAt)} />
        <KV k="PIC" v={r.picName} /><KV k="Phone" v={r.phone} /><KV k="Address" v={r.address} /></dl>
        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-ink-muted">Wholesaler relationships</h3>
        <ul className="space-y-1.5">{r.retailerLinks.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
          <Link className="text-primary hover:underline" href={`/grosir/wholesalers/${l.wholesaler.id}`}>{l.wholesaler.name}</Link>
          <span className="flex items-center gap-1"><Badge tone={l.relationType === 'PRIMARY' ? 'info' : 'neutral'}>{humanize(l.relationType)}</Badge>
            <span className="text-2xs text-ink-muted">{fmtDate(l.effectiveFrom)} → {l.effectiveTo ? fmtDate(l.effectiveTo) : 'current'}</span></span></li>)}
          {!r.retailerLinks.length && <li className="text-sm text-ink-muted">Not linked to any wholesaler.</li>}</ul></PanelBody></Panel>
      <Panel className="xl:col-span-2"><PanelHeader title="Monthly purchases" subtitle="Final ACTUAL value – company vs competitor" />
        <PanelBody><Chart ariaLabel="Monthly purchase value, company vs competitor" height={240} empty={!months.length}
          option={{ tooltip: { valueFormatter: (v: unknown) => fmtIdr(v) }, legend: { data: ['Company', 'Competitor'] }, xAxis: { type: 'category', data: months }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtIdr(v, true).replace('Rp ', '') } },
            series: [barSeries('Company', months.map((m) => val(m, 'COMPANY')), SERIES_COLOR.COMPANY), barSeries('Competitor', months.map((m) => val(m, 'COMPETITOR')), SERIES_COLOR.COMPETITOR)] }}
          table={{ columns: ['Month', 'Company', 'Competitor'], rows: months.map((m) => [m, fmtIdr(val(m, 'COMPANY')), fmtIdr(val(m, 'COMPETITOR'))]) }} /></PanelBody></Panel>
    </div>
    <Panel className="mt-4"><PanelHeader title="Transaction history" subtitle="All statuses, including rejected and superseded (latest 200)" />
      <SimpleTable rows={transactions as Row[]} columns={[{ key: 'transactionNo', label: 'Transaction', render: (t) => <Link className="text-primary hover:underline" href={`/grosir/transactions/${t.id}`}>{String(t.transactionNo)}</Link> },
        { key: 'transactionDate', label: 'Date', render: (t) => fmtDate(t.transactionDate) }, { key: 'wholesaler', label: 'Grosir', render: (t) => (t.wholesaler as { name: string } | null)?.name ?? '–' },
        { key: 'spg', label: 'SPG', render: (t) => (t.spg as { fullName: string }).fullName }, { key: 'nature', label: 'Nature', render: (t) => <NatureBadge nature={String(t.dataNature)} /> },
        { key: 'status', label: 'Status', render: (t) => <StatusBadge status={String(t.validationStatus)} /> }, { key: 'totalValue', label: 'Value', align: 'right', render: (t) => fmtIdr(t.totalValue) }]} /></Panel>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Competitor observations" />
        <SimpleTable rows={competitorObservations} max={50} columns={[{ key: 'observationDate', label: 'Date', render: (o) => fmtDate(o.observationDate) }, { key: 'brand', label: 'Brand', render: (o) => (o.brand as { name: string } | null)?.name ?? String(o.brandText ?? '–') },
          { key: 'purchasePrice', label: 'Purchase', align: 'right', render: (o) => fmtIdr(o.purchasePrice) }, { key: 'quantityPurchased', label: 'Qty', align: 'right', render: (o) => fmtNum(o.quantityPurchased) },
          { key: 'stock', label: 'Stock', render: (o) => <StatusBadge status={String(o.stockAvailability)} /> }]} /></Panel>
      <Panel><PanelHeader title="Master data changes" subtitle="From the audit trail" />
        <PanelBody>{masterDataHistory.length ? <ul className="space-y-2">{masterDataHistory.map((h) => <li key={h.id} className="text-sm"><span className="font-medium">{humanize(h.action)}</span> · <span className="text-2xs text-ink-muted">{fmtDateTime(h.createdAt)}</span>
          {h.reason && <div className="text-xs text-ink-secondary">{h.reason}</div>}</li>)}</ul> : <p className="text-sm text-ink-muted">No changes recorded.</p>}</PanelBody></Panel>
    </div>
  </>;
}

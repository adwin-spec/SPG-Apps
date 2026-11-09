'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { fmtDate, fmtIdr, fmtNum, fmtPct } from '@/lib/format';
import { Chart, SERIES_COLOR, barSeries } from '@/components/chart';
import { Stat, StatRow } from '@/components/stat';
import { SimpleTable } from '@/components/data-table';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';

type Row = Record<string, string | number | null>;
interface Intel { wholesaler: { id: string; code: string; name: string; district: string; assignedSpg: string | null }; period: { from: string; to: string; previous: { from: string; to: string } };
  counts: Record<string, number>; productMovement: Row[]; brandShare: Row[]; stock: Row[]; retailerPotential: Row[]; definitions: { activeRetailerWindowDays: number; finalStatuses: string[] } }

export default function WholesalerIntel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const today = jakartaDate();
  const [from, setFrom] = useState(new Date(Date.parse(today) - 29 * 864e5).toISOString().slice(0, 10)); const [to, setTo] = useState(today);
  const q = useQuery({ queryKey: ['ws-intel', id, from, to], queryFn: () => api<Intel>(`/wholesale/wholesalers/${id}/intelligence`, { query: { from, to } }) });
  const d = q.data; const c = d?.counts;
  const win = d?.definitions.activeRetailerWindowDays ?? 30;
  const change = (r: Row) => { const cur = Number(r.qty ?? 0), prev = Number(r.prev_qty ?? 0); return prev ? ((cur - prev) / prev) * 100 : null; };
  return <>
    <Link href="/grosir/wholesalers" className="mb-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ArrowLeft className="h-3 w-3" />Wholesalers</Link>
    <PageHeader title={d ? `${d.wholesaler.name}` : 'Wholesale intelligence'} description={d ? `${d.wholesaler.code} · ${d.wholesaler.district} · SPG ${d.wholesaler.assignedSpg ?? 'unassigned'} · compared with ${d.period.previous.from} – ${d.period.previous.to}` : undefined}
      actions={<div className="flex items-center gap-1"><Input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" /><span className="text-xs">–</span><Input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-[9.5rem] text-xs" /></div>} />
    {q.error && <ErrorBox error={q.error} />}
    <StatRow cols={4}>
      <Stat loading={q.isLoading} label="Registered retailers" value={fmtNum(c?.registered_retailers)} hint="Retailers with an active link to this wholesaler (status ≠ CLOSED)" />
      <Stat loading={q.isLoading} label="Active-status retailers" value={fmtNum(c?.active_status_retailers)} hint="Linked retailers whose master status is ACTIVE" />
      <Stat loading={q.isLoading} label={`Active retailers (${win} d)`} value={fmtNum(c?.active_retailers)} hint={`Distinct retailers with a final ACTUAL transaction in the last ${win} days to the end date`} />
      <Stat loading={q.isLoading} label="Wholesaler visits" value={fmtNum(c?.visits)} hint="Completed SPG visits in the period" />
    </StatRow>
    <div className="mt-px grid grid-cols-1 gap-px overflow-hidden rounded-b-lg border-x border-b border-border bg-border sm:grid-cols-3">
      <Stat loading={q.isLoading} label="Transacting retailers" value={fmtNum(c?.transacting_retailers)} hint="Distinct retailers with a final ACTUAL transaction in the period" />
      <Stat loading={q.isLoading} label="Company-product buying retailers" value={fmtNum(c?.company_buying_retailers)} hint="Distinct retailers with at least one COMPANY product line" />
      <Stat loading={q.isLoading} label="Competitor buying retailers" value={fmtNum(c?.competitor_buying_retailers)} hint="Distinct retailers with at least one COMPETITOR product line" />
    </div>
    <p className="mt-1 text-2xs text-ink-muted">Commercial figures use only {d?.definitions.finalStatuses.join('/') ?? 'final'} ACTUAL transactions.</p>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Brand share" subtitle="Quantity purchased by retailers via this wholesaler" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Brand share by quantity" height={260} empty={!d?.brandShare.length}
          option={{ grid: { left: 24, right: 16, bottom: 8, top: 32, containLabel: true }, tooltip: { trigger: 'axis' }, legend: { data: ['Company', 'Competitor'] }, xAxis: { type: 'category', data: d?.brandShare.map((b) => String(b.brand)), axisLabel: { interval: 0, rotate: 20 } }, yAxis: { type: 'value' },
            series: [barSeries('Company', d?.brandShare.map((b) => (b.owner === 'COMPANY' ? b.qty : null)) ?? [], SERIES_COLOR.COMPANY, { stack: 's' }), barSeries('Competitor', d?.brandShare.map((b) => (b.owner === 'COMPETITOR' ? b.qty : null)) ?? [], SERIES_COLOR.COMPETITOR, { stack: 's' })] }}
          table={{ columns: ['Brand', 'Owner', 'Qty', 'Value'], rows: (d?.brandShare ?? []).map((b) => [String(b.brand), String(b.owner), fmtNum(b.qty), fmtIdr(b.value)]) }} />}</PanelBody></Panel>
      <Panel><PanelHeader title="Latest stock observations" subtitle="Company SKUs at this wholesaler" />
        <SimpleTable rows={d?.stock ?? []} columns={[{ key: 'sku', label: 'SKU' }, { key: 'observation_date', label: 'Observed', render: (r) => fmtDate(r.observation_date) },
          { key: 'stock_quantity', label: 'Stock', align: 'right', render: (r) => fmtNum(r.stock_quantity) }, { key: 'stock_availability', label: 'Availability', render: (r) => <StatusBadge status={String(r.stock_availability)} /> },
          { key: 'buy_price', label: 'Buy', align: 'right', render: (r) => fmtIdr(r.buy_price) }, { key: 'restock_frequency', label: 'Restock' }]} /></Panel>
    </div>
    <Panel className="mt-4"><PanelHeader title="Product movement" subtitle={`Current vs previous period (${d?.period.previous.from ?? ''} – ${d?.period.previous.to ?? ''})`} />
      <SimpleTable rows={d?.productMovement ?? []} columns={[{ key: 'owner', label: 'Owner', render: (r) => <Badge tone={r.owner === 'COMPANY' ? 'info' : 'serious'}>{r.owner === 'COMPANY' ? 'Company' : 'Competitor'}</Badge> },
        { key: 'brand', label: 'Brand' }, { key: 'product', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) },
        { key: 'prev_qty', label: 'Prev. qty', align: 'right', render: (r) => fmtNum(r.prev_qty) },
        { key: 'chg', label: 'Change', align: 'right', render: (r) => { const v = change(r); return v == null ? <span className="text-ink-muted">new / n.a.</span> : <span className={v >= 0 ? 'text-good-text' : 'text-critical-text'}>{v >= 0 ? '+' : ''}{fmtPct(v)}</span>; } },
        { key: 'value', label: 'Value', align: 'right', render: (r) => fmtIdr(r.value) }, { key: 'avg_price', label: 'Avg price', align: 'right', render: (r) => fmtIdr(r.avg_price) }, { key: 'buyers', label: 'Buyers', align: 'right' }]} /></Panel>
    <Panel className="mt-4"><PanelHeader title="Retailer potential" subtitle="Company vs competitor purchase value per linked retailer" />
      <SimpleTable rows={d?.retailerPotential ?? []} columns={[{ key: 'name', label: 'Retailer', render: (r) => <Link className="text-primary hover:underline" href={`/grosir/retailers/${r.id}`}>{r.name}</Link> },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> }, { key: 'tx_count', label: 'Tx', align: 'right' },
        { key: 'company_value', label: 'Company value', align: 'right', render: (r) => fmtIdr(r.company_value) }, { key: 'prev_company_value', label: 'Prev. company', align: 'right', render: (r) => fmtIdr(r.prev_company_value) },
        { key: 'competitor_value', label: 'Competitor value', align: 'right', render: (r) => fmtIdr(r.competitor_value) },
        { key: 'share', label: 'Company share', align: 'right', render: (r) => { const t = Number(r.company_value) + Number(r.competitor_value); return t ? fmtPct((Number(r.company_value) / t) * 100) : '–'; } },
        { key: 'last_transaction_date', label: 'Last tx', render: (r) => fmtDate(r.last_transaction_date) }]} /></Panel>
  </>;
}

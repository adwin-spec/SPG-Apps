'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/use-filters';
import { fmtDec, fmtIdr, fmtNum, fmtPct, humanize } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { ExportMenu } from '@/components/export-menu';
import { Chart, SERIES, SERIES_COLOR, STATUS_COLOR, barSeries, lineSeries } from '@/components/chart';
import { Stat, StatRow } from '@/components/stat';
import { SimpleTable } from '@/components/data-table';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';

type Row = Record<string, unknown>;
interface Market {
  filter: { from: string; to: string };
  companyVsCompetitor: Row[]; brandDistribution: Row[]; skuDistribution: Row[]; pricing: Row[]; priceTrend: Row[]; stock: Row[]; purchasing: Row[];
  wholesaleCoverage: Row; horecaPenetration: Row & { penetrationPct: number | null }; availabilityBySku: (Row & { availabilityPct: number | null })[]; shareOfShelf: Row[]; promotions: Row[];
}
const AVAIL = [{ k: 'IN_STOCK', label: 'In stock', color: STATUS_COLOR.good }, { k: 'LOW_STOCK', label: 'Low stock', color: STATUS_COLOR.warning }, { k: 'OUT_OF_STOCK', label: 'Out of stock', color: STATUS_COLOR.critical }, { k: 'UNKNOWN', label: 'Unknown', color: '#9ca3af' }];
const SEGMENTS = [{ k: 'COMPANY_ONLY', label: 'Company only', color: SERIES_COLOR.COMPANY }, { k: 'BOTH', label: 'Both', color: SERIES[6] }, { k: 'COMPETITOR_ONLY', label: 'Competitor only', color: SERIES_COLOR.COMPETITOR }];
const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown, compact = false) => <span className="whitespace-nowrap">{fmtIdr(v, compact)}</span>;

/** Stable brand → colour: brands sorted by name take the categorical slots in fixed order (colour follows entity). */
function brandColors(brands: string[]) {
  const sorted = [...new Set(brands)].sort((a, b) => a.localeCompare(b));
  return Object.fromEntries(sorted.map((b, i) => [b, i < SERIES.length ? SERIES[i] : '#9ca3af']));
}

export default function MarketPage() {
  const { filters } = useFilters();
  const q = useQuery({ queryKey: ['market', filters], queryFn: () => api<Market>('/analytics/market', { query: filters }) });
  const d = q.data;
  const company = d?.companyVsCompetitor.find((r) => r.owner === 'COMPANY'); const comp = d?.companyVsCompetitor.find((r) => r.owner === 'COMPETITOR');
  const shareQty = company || comp ? (n(company?.qty) / (n(company?.qty) + n(comp?.qty))) * 100 : null;
  const brandColor = brandColors((d?.brandDistribution ?? []).map((b) => String(b.brand)));
  // price trend: top 3 brands by number of observations; the rest are folded (listed in the table)
  const trendBrands = (d?.brandDistribution ?? []).map((b) => String(b.brand)).filter((b) => d?.priceTrend.some((p) => p.brand === b)).slice(0, 3);
  const weeks = [...new Set((d?.priceTrend ?? []).map((p) => String(p.week)))].sort();
  const stockBrands = [...new Set((d?.stock ?? []).map((s) => String(s.brand)))];
  const ws = d?.wholesaleCoverage ?? {}; const hp = d?.horecaPenetration;
  const sos = d?.shareOfShelf ?? [];
  const chartH = 240;

  return <>
    <PageHeader title="Market intelligence" description={d ? `${d.filter.from} – ${d.filter.to} · company vs competitor across grosir, HORECA and retail` : 'Company vs competitor'} actions={<ExportMenu report="competitor-intelligence" filters={filters} />} />
    <FilterBar fields={['dates', 'category', 'region', 'area', 'district', 'subdistrict', 'spg', 'brand']} />
    {q.error && <ErrorBox error={q.error} />}
    <StatRow cols={6}>
      <Stat loading={q.isLoading} label="Company share of retailer purchases" value={fmtPct(shareQty)} sub="by quantity, final ACTUAL" hint="Company qty / (company + competitor qty) on approved retailer transactions" />
      <Stat loading={q.isLoading} label="Company value" value={fmtIdr(company?.value, true)} sub={`${fmtNum(company?.retailers)} retailers`} />
      <Stat loading={q.isLoading} label="Competitor value" value={fmtIdr(comp?.value, true)} sub={`${fmtNum(comp?.retailers)} retailers`} />
      <Stat loading={q.isLoading} label="Wholesaler coverage" value={`${fmtNum(ws.wholesalers_visited)} / ${fmtNum(ws.wholesalers)}`} sub={`${fmtNum(ws.transacting_retailers)} of ${fmtNum(ws.linked_retailers)} linked retailers transacting`} />
      <Stat loading={q.isLoading} label="HORECA penetration" value={fmtPct(hp?.penetrationPct)} sub={hp && `${fmtNum(hp.buying_outlets)} of ${fmtNum(hp.assigned_outlets)} outlets buying`} />
      <Stat loading={q.isLoading} label="Share of Shelf (period)" value={fmtPct(sos.length ? (sos.reduce((a, s) => a + n(s.company_facing), 0) / Math.max(1, sos.reduce((a, s) => a + n(s.total_facing), 0))) * 100 : null)} sub="Σ company / Σ total facing" />
    </StatRow>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel><PanelHeader title="Competitor brand presence" subtitle="Observations and outlets where seen" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Observations by competitor brand" height={chartH} empty={!d?.brandDistribution.length}
          option={{ legend: { show: false }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
            xAxis: { type: 'value', minInterval: 1 }, yAxis: { type: 'category', inverse: true, data: d?.brandDistribution.map((b) => b.brand) },
            series: [barSeries('Observations', (d?.brandDistribution ?? []).map((b) => ({ value: n(b.observations), itemStyle: { color: brandColor[String(b.brand)], borderRadius: [0, 4, 4, 0] } })), SERIES[1])] }}
          table={{ columns: ['Brand', 'Observations', 'Outlets', 'Qty purchased', 'Facing'], rows: (d?.brandDistribution ?? []).map((b) => [String(b.brand), n(b.observations), n(b.outlets), fmtNum(b.qty_purchased), fmtNum(b.facing)]) }} />}</PanelBody></Panel>
      <Panel><PanelHeader title="Competitor stock availability" subtitle="Share of observations by stock status" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Stock availability by competitor brand" height={chartH} empty={!stockBrands.length}
          option={{ tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { data: AVAIL.map((a) => a.label) }, xAxis: { type: 'category', data: stockBrands, axisLabel: { interval: 0, width: 110, overflow: 'truncate' } }, yAxis: { type: 'value', minInterval: 1 },
            series: AVAIL.map((a, i) => barSeries(a.label, stockBrands.map((b) => n(d?.stock.find((s) => s.brand === b && s.availability === a.k)?.n)), a.color, { stack: 'st', itemStyle: { color: a.color, borderRadius: i === AVAIL.length - 1 ? [4, 4, 0, 0] : 0, borderColor: '#fff', borderWidth: 2 } })) }}
          table={{ columns: ['Brand', ...AVAIL.map((a) => a.label)], rows: stockBrands.map((b) => [b, ...AVAIL.map((a) => n(d?.stock.find((s) => s.brand === b && s.availability === a.k)?.n))]) }} />}</PanelBody></Panel>
      <Panel><PanelHeader title="Retailer purchasing behaviour" subtitle="Retailers by what they bought in the period" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Retailer purchasing segments" height={chartH} empty={!d?.purchasing.length}
          option={{ legend: { show: false }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: { type: 'category', data: SEGMENTS.map((s) => s.label), axisLabel: { interval: 0 } }, yAxis: { type: 'value', minInterval: 1 },
            series: [barSeries('Retailers', SEGMENTS.map((s) => ({ value: n(d?.purchasing.find((p) => p.segment === s.k)?.retailers), itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] } })), SERIES[0], { label: { show: true, position: 'top', color: '#4b5563' } })] }}
          table={{ columns: ['Segment', 'Retailers'], rows: SEGMENTS.map((s) => [s.label, n(d?.purchasing.find((p) => p.segment === s.k)?.retailers)]) }} />}</PanelBody></Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Competitor purchase price trend" subtitle={`Weekly average · top ${trendBrands.length} brands by observations (others in the pricing table)`} />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Weekly competitor price trend" height={chartH} empty={!weeks.length}
          option={{ tooltip: { valueFormatter: (v: unknown) => fmtIdr(v) }, legend: { data: trendBrands }, xAxis: { type: 'category', data: weeks.map((w) => w.slice(5)) }, yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => fmtNum(v) } },
            series: trendBrands.map((b) => lineSeries(b, weeks.map((w) => { const p = d?.priceTrend.find((x) => x.week === w && x.brand === b); return p ? Math.round(n(p.avg_price)) : null; }), brandColor[b], { showSymbol: true, connectNulls: true })) }}
          table={{ columns: ['Week', ...trendBrands], rows: weeks.map((w) => [w, ...trendBrands.map((b) => { const p = d?.priceTrend.find((x) => x.week === w && x.brand === b); return p ? fmtIdr(p.avg_price) : null; })]) }} />}</PanelBody></Panel>
      <Panel><PanelHeader title="Share of Shelf" subtitle="Weekly Σ company facing / Σ total category facing (outlets with facing data)" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-60" /> : <Chart ariaLabel="Weekly share of shelf" height={chartH} empty={!sos.length}
          option={{ legend: { show: false }, tooltip: { valueFormatter: (v: unknown) => fmtPct(v) }, xAxis: { type: 'category', data: sos.map((s) => String(s.week).slice(5)) }, yAxis: { type: 'value', min: 0, axisLabel: { formatter: '{value}%' } },
            series: [lineSeries('Share of Shelf', sos.map((s) => n(s.share_of_shelf_pct)), SERIES[0], { showSymbol: true })] }}
          table={{ columns: ['Week', 'Company', 'Competitor', 'Total', 'SoS %'], rows: sos.map((s) => [String(s.week), n(s.company_facing), n(s.competitor_facing), n(s.total_facing), fmtPct(s.share_of_shelf_pct)]) }} />}</PanelBody></Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel className="xl:col-span-2"><PanelHeader title="Competitor pricing" subtitle="Purchase and selling prices observed in the field" actions={<Link className="text-xs text-primary hover:underline" href="/market/observations">All observations →</Link>} />
        <div className="max-h-[360px] overflow-y-auto"><SimpleTable rows={d?.pricing ?? []} columns={[{ key: 'brand', label: 'Brand' }, { key: 'product', label: 'Product' },
          { key: 'avg_purchase_price', label: 'Avg buy', align: 'right', render: (r) => money(r.avg_purchase_price) }, { key: 'min_purchase_price', label: 'Min', align: 'right', render: (r) => money(r.min_purchase_price) },
          { key: 'max_purchase_price', label: 'Max', align: 'right', render: (r) => money(r.max_purchase_price) }, { key: 'avg_selling_price', label: 'Avg sell', align: 'right', render: (r) => money(r.avg_selling_price) }, { key: 'n', label: 'Obs.', align: 'right' }]} /></div></Panel>
      <Panel><PanelHeader title="Promotion activity" subtitle="Competitor promotions and POSM seen" />
        <div className="max-h-[360px] overflow-y-auto"><SimpleTable rows={d?.promotions ?? []} columns={[{ key: 'brand', label: 'Brand' }, { key: 'promotions', label: 'Promos', align: 'right' }, { key: 'with_posm', label: 'POSM', align: 'right' },
          { key: 'examples', label: 'Examples', render: (r) => <span className="text-xs text-ink-secondary">{(r.examples as string[] | null)?.slice(0, 2).join('; ') || '–'}</span> }]} /></div></Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Company SKU distribution" subtitle="Final company sales by SKU" />
        <div className="max-h-[360px] overflow-y-auto"><SimpleTable rows={d?.skuDistribution ?? []} columns={[{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'qty', label: 'Qty', align: 'right', render: (r) => fmtNum(r.qty) },
          { key: 'value', label: 'Value', align: 'right', render: (r) => money(r.value, true) }, { key: 'outlets', label: 'Outlets', align: 'right' }]} /></div></Panel>
      <Panel><PanelHeader title="Outlet availability by SKU" subtitle="Reguler availability checks (final status)" />
        <div className="max-h-[360px] overflow-y-auto"><SimpleTable rows={(d?.availabilityBySku ?? []) as Row[]} columns={[{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'checks', label: 'Checks', align: 'right' },
          { key: 'availabilityPct', label: 'Available', align: 'right', render: (r) => fmtPct(r.availabilityPct) }, { key: 'oos', label: 'OOS', align: 'right' }, { key: 'top_oos_reason', label: 'Top OOS reason', render: (r) => humanize(r.top_oos_reason ?? '–') }]} /></div></Panel>
    </div>
    <p className="mt-3 text-2xs text-ink-muted">Company/competitor purchase figures use approved, ACTUAL retailer transactions only. Observations exclude rejected records. Average SKU count per HORECA outlet: {fmtDec(hp && n(hp.buying_outlets) ? n(hp.outlet_sku_pairs) / n(hp.buying_outlets) : null)}.</p>
  </>;
}

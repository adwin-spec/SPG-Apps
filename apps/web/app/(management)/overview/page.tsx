'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/use-filters';
import { fmtDec, fmtIdr, fmtNum, fmtPct } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { ExportMenu } from '@/components/export-menu';
import { Chart, SERIES, SERIES_COLOR, barSeries, lineSeries, STATUS_COLOR } from '@/components/chart';
import { Stat, StatRow } from '@/components/stat';
import { SimpleTable } from '@/components/data-table';
import { PageHeader, Panel, PanelBody, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

type Row = Record<string, string | number | null>;
interface Executive {
  filter: { from: string; to: string; performancePeriod: string };
  cards: { activeSpg: number; activeSpgByCategory: Record<string, number>; visits: number; effectiveVisits: number; outsideGeofenceVisits: number; visitCompliancePct: number | null; plannedVisits: number;
    productiveOutlets: number; outletsVisited: number; salesVolume: number; salesValue: number; salesByCategory: Row[]; avgPerformanceScore: number | null; scoredSpgs: number; targetAchievementPct: number | null; reportingCompliancePct: number | null; lateReports: number };
  trend: { date: string; visits: number; sales_value: number }[]; salesByWeek: Row[]; geography: Row[];
  ranking: { top: Row[]; bottom: Row[] }; distribution: { bucket: number; spgs: number }[]; targetVsActual: Row[]; definitions: Record<string, string>;
}
const CATS = ['GROSIR', 'HORECA', 'REGULER'];

export default function ExecutivePage() {
  const { filters } = useFilters();
  const q = useQuery({ queryKey: ['executive', filters], queryFn: () => api<Executive>('/analytics/executive', { query: filters }) });
  const d = q.data; const c = d?.cards;
  const weeks = [...new Set((d?.salesByWeek ?? []).map((r) => String(r.week)))];
  return <>
    <PageHeader title="Executive overview" description={d ? `${d.filter.from} – ${d.filter.to} · performance period ${d.filter.performancePeriod}` : 'Company-wide field performance'} actions={<ExportMenu report="monthly-performance" filters={filters} />} />
    <FilterBar />
    {q.error && <ErrorBox error={q.error} />}
    <StatRow cols={6}>
      <Stat loading={q.isLoading} label="Active SPG" value={fmtNum(c?.activeSpg)} sub={c && CATS.map((k) => `${k[0]}${k.slice(1).toLowerCase()} ${c.activeSpgByCategory[k] ?? 0}`).join(' · ')} href="/spgs" />
      <Stat loading={q.isLoading} label="Visits" value={fmtNum(c?.visits)} sub={c && `${fmtNum(c.effectiveVisits)} effective`} hint={d?.definitions.effectiveVisit} href="/attendance/visits" />
      <Stat loading={q.isLoading} label="Visit compliance" value={fmtPct(c?.visitCompliancePct)} sub={c && `of ${fmtNum(c.plannedVisits)} planned`} hint="Planned visits executed / planned visits" />
      <Stat loading={q.isLoading} label="Sales value" value={fmtIdr(c?.salesValue, true)} sub={c && `${fmtNum(c.salesVolume)} units`} hint={d?.definitions.sales} />
      <Stat loading={q.isLoading} label="Avg performance score" value={fmtDec(c?.avgPerformanceScore)} sub={c && `${c.scoredSpgs} SPG scored`} href="/performance" />
      <Stat loading={q.isLoading} label="Reporting compliance" value={fmtPct(c?.reportingCompliancePct)} sub={c && `${c.lateReports} late reports`} />
    </StatRow>
    <div className="mt-px grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-x border-b border-border bg-border sm:grid-cols-4">
      <Stat loading={q.isLoading} label="Productive outlets" value={fmtNum(c?.productiveOutlets)} sub={c && `${fmtNum(c.outletsVisited)} outlets visited`} hint="Outlets with ≥1 final sales record" />
      <Stat loading={q.isLoading} label="Target achievement (commercial)" value={fmtPct(c?.targetAchievementPct)} hint="Average capped achievement of COMMERCIAL KPIs with a defined target" />
      <Stat loading={q.isLoading} label="Effective visit rate" value={fmtPct(c && c.visits ? (c.effectiveVisits / c.visits) * 100 : null)} />
      <Stat loading={q.isLoading} label="Outside geofence" value={fmtNum(c?.outsideGeofenceVisits)} sub="visits flagged for review" href="/overview/operational" />
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel className="xl:col-span-2"><PanelHeader title="Daily activity & sales" subtitle="Completed visits and final company sales value per day" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-64" /> : <div className="grid gap-4 md:grid-cols-2">
          <Chart ariaLabel="Visits per day" height={220} empty={!d?.trend.length}
            option={{ legend: { show: false }, title: { text: 'Visits', textStyle: { fontSize: 12, fontWeight: 600, color: '#111827' } }, xAxis: { type: 'category', data: d?.trend.map((t) => t.date.slice(5)) }, yAxis: { type: 'value' }, series: [lineSeries('Visits', d?.trend.map((t) => t.visits) ?? [], SERIES[0], { areaStyle: { color: 'rgba(42,120,214,0.08)' } })] }}
            table={{ columns: ['Date', 'Visits', 'Sales value'], rows: (d?.trend ?? []).map((t) => [t.date, t.visits, fmtIdr(t.sales_value)]) }} />
          <Chart ariaLabel="Sales value per day" height={220} empty={!d?.trend.length}
            option={{ legend: { show: false }, title: { text: 'Sales value (Rp)', textStyle: { fontSize: 12, fontWeight: 600, color: '#111827' } }, tooltip: { valueFormatter: (v: unknown) => fmtIdr(v) }, xAxis: { type: 'category', data: d?.trend.map((t) => t.date.slice(5)) }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtIdr(v, true).replace('Rp ', '') } }, series: [barSeries('Sales value', d?.trend.map((t) => t.sales_value) ?? [], SERIES[0])] }} />
        </div>}</PanelBody></Panel>
      <Panel><PanelHeader title="Sales by SPG category" subtitle="Weekly final company sales value" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-64" /> : <Chart ariaLabel="Weekly sales by category" height={240} empty={!weeks.length}
          option={{ tooltip: { valueFormatter: (v: unknown) => fmtIdr(v) }, xAxis: { type: 'category', data: weeks.map((w) => w.slice(5)) }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtIdr(v, true).replace('Rp ', '') } },
            series: CATS.map((k, i) => barSeries(k, weeks.map((w) => Number(d?.salesByWeek.find((r) => r.week === w && r.category === k)?.value ?? 0)), SERIES_COLOR[k], { stack: 'cat', itemStyle: { color: SERIES_COLOR[k], borderRadius: i === CATS.length - 1 ? [4, 4, 0, 0] : 0, borderColor: '#fff', borderWidth: 2 } })) }}
          table={{ columns: ['Week', ...CATS], rows: weeks.map((w) => [w, ...CATS.map((k) => fmtIdr(d?.salesByWeek.find((r) => r.week === w && r.category === k)?.value ?? 0))]) }} />}</PanelBody></Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel><PanelHeader title="Performance distribution" subtitle="Number of SPG per score band (0–100)" />
        <PanelBody><Chart ariaLabel="Performance score distribution" height={220} empty={!d?.distribution.length}
          option={{ legend: { show: false }, tooltip: { trigger: 'item' }, xAxis: { type: 'category', data: Array.from({ length: 10 }, (_, i) => `${i * 10}–${i * 10 + 10}`) }, yAxis: { type: 'value', minInterval: 1 },
            series: [barSeries('SPG', Array.from({ length: 10 }, (_, i) => ({ value: d?.distribution.find((x) => Number(x.bucket) === i + 1)?.spgs ?? 0, itemStyle: { color: i >= 9 ? STATUS_COLOR.good : i >= 7 ? STATUS_COLOR.warning : STATUS_COLOR.critical, borderRadius: [4, 4, 0, 0] } })), SERIES[0])] }}
          table={{ columns: ['Band', 'SPG'], rows: (d?.distribution ?? []).map((x) => [`${(Number(x.bucket) - 1) * 10}–${Number(x.bucket) * 10}`, x.spgs]) }} />
          <p className="mt-2 text-2xs text-ink-muted">Bands follow the configured performance status (Good ≥ 90, Watch ≥ 70, Critical &lt; 70 – simulation defaults).</p></PanelBody></Panel>
      <Panel><PanelHeader title="Top performers" subtitle={`Period ${d?.filter.performancePeriod ?? ''}`} />
        <SimpleTable rows={d?.ranking.top ?? []} max={8} columns={[{ key: 'full_name', label: 'SPG', render: (r) => <Link className="text-primary hover:underline" href={`/performance/${r.spg_id}?period=${d?.filter.performancePeriod}`}>{r.full_name}</Link> }, { key: 'category', label: 'Cat.' }, { key: 'total_score', label: 'Score', align: 'right', render: (r) => fmtDec(r.total_score) }, { key: 'performance_status', label: 'Status', render: (r) => <StatusBadge status={String(r.performance_status)} /> }]} /></Panel>
      <Panel><PanelHeader title="Needs attention" subtitle="Lowest scores" />
        <SimpleTable rows={d?.ranking.bottom ?? []} max={8} columns={[{ key: 'full_name', label: 'SPG', render: (r) => <Link className="text-primary hover:underline" href={`/performance/${r.spg_id}?period=${d?.filter.performancePeriod}`}>{r.full_name}</Link> }, { key: 'category', label: 'Cat.' }, { key: 'total_score', label: 'Score', align: 'right', render: (r) => fmtDec(r.total_score) }, { key: 'performance_status', label: 'Status', render: (r) => <StatusBadge status={String(r.performance_status)} /> }]} /></Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Target vs actual – commercial KPIs" subtitle="Sum over SPG with a defined target; KPIs without target are counted, never treated as zero" />
        <SimpleTable rows={d?.targetVsActual ?? []} columns={[{ key: 'category', label: 'Cat.' }, { key: 'name', label: 'KPI' },
          { key: 'actual', label: 'Actual', align: 'right', render: (r) => (r.unit === 'IDR' ? fmtIdr(r.actual, true) : fmtNum(r.actual)) },
          { key: 'target', label: 'Target', align: 'right', render: (r) => (r.target == null ? 'Undefined' : r.unit === 'IDR' ? fmtIdr(r.target, true) : fmtNum(r.target)) },
          { key: 'ach', label: 'Achv.', align: 'right', render: (r) => (r.target ? fmtPct((Number(r.actual) / Number(r.target)) * 100) : '–') },
          { key: 'without_target', label: 'SPG w/o target', align: 'right' }]} /></Panel>
      <Panel><PanelHeader title="Geography" subtitle="By area – click through to drill down" actions={<Link href={`/overview/drilldown?level=region`} className="text-xs text-primary hover:underline">Open drill-down →</Link>} />
        <PanelBody><Chart ariaLabel="Areas plotted by coordinates, bubble size = sales value" height={240} empty={!d?.geography.length}
          option={{ legend: { show: false }, tooltip: { trigger: 'item', formatter: (p: { data: number[]; name: string }) => `<b>${p.name}</b><br/>Sales ${fmtIdr(p.data[2], true)}<br/>Visits ${fmtNum(p.data[3])}<br/>Avg score ${fmtDec(p.data[4])}` },
            xAxis: { type: 'value', scale: true, name: 'Longitude', nameTextStyle: { color: '#6b7280' } }, yAxis: { type: 'value', scale: true, name: 'Latitude', nameTextStyle: { color: '#6b7280' } },
            series: [{ type: 'scatter', data: (d?.geography ?? []).map((g) => ({ name: `${g.area} (${g.region})`, value: [g.lng, g.lat, g.sales_value, g.visits, g.avg_score] })),
              symbolSize: (v: number[]) => 12 + Math.sqrt(Number(v[2]) / 1e6) * 4, itemStyle: { color: SERIES[0], opacity: 0.85, borderColor: '#fff', borderWidth: 2 }, label: { show: true, formatter: (p: { name: string }) => p.name.split(' (')[0], position: 'right', color: '#4b5563', fontSize: 11 } }] }}
          table={{ columns: ['Area', 'Region', 'Visits', 'Sales', 'Avg score'], rows: (d?.geography ?? []).map((g) => [String(g.area), String(g.region), Number(g.visits), fmtIdr(g.sales_value, true), fmtDec(g.avg_score)]) }} /></PanelBody></Panel>
    </div>
  </>;
}

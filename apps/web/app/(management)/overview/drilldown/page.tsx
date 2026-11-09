'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/use-filters';
import { fmtIdr, fmtNum } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { Chart, SERIES, barSeries } from '@/components/chart';
import { SimpleTable } from '@/components/data-table';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';

const LEVELS = [
  { level: 'region', label: 'Region', key: 'regionId' },
  { level: 'area', label: 'Area', key: 'areaId' },
  { level: 'district', label: 'Kabupaten', key: 'districtId' },
  { level: 'subdistrict', label: 'Kecamatan', key: 'subdistrictId' },
  { level: 'spg', label: 'SPG', key: 'spgId' },
  { level: 'outlet', label: 'Outlet', key: 'outletId' },
] as const;
type DRow = { id: string; name: string; visits: number; sales_value: number; sales_volume: number; outlets: number; spgs: number };

export default function DrilldownPage() {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const { filters } = useFilters();
  const level = (LEVELS.find((l) => l.level === sp.get('level')) ?? LEVELS[0]).level;
  const idx = LEVELS.findIndex((l) => l.level === level);
  const trail = (sp.get('trail') ?? '').split('|').filter(Boolean);
  const q = useQuery({ queryKey: ['drilldown', level, filters], queryFn: () => api<{ rows: DRow[]; nextLevel: string | null }>('/analytics/drilldown', { query: { ...filters, level } }) });
  const rows = q.data?.rows ?? [];

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const drill = (r: DRow) => {
    if (level === 'outlet') { router.push(`/attendance/visits?outletId=${r.id}&from=${filters.from}&to=${filters.to}`); return; }
    go({ [LEVELS[idx].key]: r.id, level: LEVELS[idx + 1].level, trail: [...trail, r.name].join('|') });
  };
  const crumb = (i: number) => {
    // i = -1 → national; else go back to level i+1 keeping filters up to level i
    const patch: Record<string, string | null> = { level: LEVELS[i + 1].level, trail: trail.slice(0, i + 1).join('|') || null };
    LEVELS.forEach((l, j) => { if (j > i) patch[l.key] = null; });
    go(patch);
  };
  const top = rows.slice(0, 15);

  return <>
    <PageHeader title="Drill-down" description="National → Region → Area → Kabupaten → Kecamatan → SPG → Outlet → Visit → Transaction. Every number links to the next level." />
    <FilterBar fields={['dates', 'category']} />
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
      <button className="text-primary hover:underline" onClick={() => crumb(-1)}>National</button>
      {trail.map((t, i) => <span key={i} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
        <button className="text-primary hover:underline" onClick={() => crumb(i)}><span className="text-ink-muted">{LEVELS[i].label}:</span> {t}</button></span>)}
      <ChevronRight className="h-3.5 w-3.5 text-ink-muted" aria-hidden /><span className="font-medium">{LEVELS[idx].label}</span>
    </nav>
    {q.error && <ErrorBox error={q.error} />}
    <div className="grid gap-4 xl:grid-cols-5">
      <Panel className="xl:col-span-2"><PanelHeader title={`Sales value by ${LEVELS[idx].label.toLowerCase()}`} subtitle="Final ACTUAL company sales · top 15" />
        <PanelBody>{q.isLoading ? <Skeleton className="h-72" /> : <Chart ariaLabel={`Sales value by ${LEVELS[idx].label}`} height={Math.max(220, top.length * 26)} empty={!top.length}
          option={{ legend: { show: false }, grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => fmtIdr(v) },
            xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtIdr(v, true).replace('Rp ', '') } }, yAxis: { type: 'category', inverse: true, data: top.map((r) => r.name), axisLabel: { width: 140, overflow: 'truncate' } },
            series: [barSeries('Sales value', top.map((r) => r.sales_value), SERIES[0], { itemStyle: { color: SERIES[0], borderRadius: [0, 4, 4, 0] } })] }}
          table={{ columns: [LEVELS[idx].label, 'Sales value', 'Visits'], rows: rows.map((r) => [r.name, fmtIdr(r.sales_value), r.visits]) }} />}</PanelBody></Panel>
      <Panel className="xl:col-span-3"><PanelHeader title={`${LEVELS[idx].label} breakdown`} subtitle={level === 'outlet' ? 'Click an outlet to open its visits' : `Click a row to drill into ${LEVELS[idx + 1]?.label ?? ''}`} />
        {q.isLoading ? <PanelBody><Skeleton className="h-60" /></PanelBody> :
          <SimpleTable rows={rows as unknown as Record<string, unknown>[]} columns={[
            { key: 'name', label: LEVELS[idx].label, render: (r) => <button className="text-left text-primary hover:underline" onClick={() => drill(r as unknown as DRow)}>{String(r.name)}</button> },
            { key: 'sales_value', label: 'Sales value', align: 'right', render: (r) => fmtIdr(r.sales_value, true) },
            { key: 'sales_volume', label: 'Volume', align: 'right', render: (r) => fmtNum(r.sales_volume) },
            { key: 'visits', label: 'Visits', align: 'right', render: (r) => fmtNum(r.visits) },
            { key: 'outlets', label: 'Outlets', align: 'right', render: (r) => fmtNum(r.outlets) },
            { key: 'spgs', label: 'SPG', align: 'right', render: (r) => fmtNum(r.spgs) },
          ]} />}
        {level === 'outlet' && <PanelBody className="border-t border-border py-2 text-xs text-ink-muted">Next levels: <Link className="text-primary hover:underline" href="/attendance/visits">visits</Link> → visit detail → transactions.</PanelBody>}
      </Panel>
    </div>
  </>;
}

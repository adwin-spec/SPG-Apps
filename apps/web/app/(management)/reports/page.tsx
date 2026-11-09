'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtDec, fmtIdr, fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FilterBar } from '@/components/filter-bar';
import { ExportMenu } from '@/components/export-menu';
import { SimpleTable } from '@/components/data-table';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';

type Col = { key: string; label: string; type?: 'text' | 'number' | 'money' | 'pct' | 'date' };
type Catalog = { key: string; title: string; columns: Col[] }[];
type Preview = { key: string; title: string; columns: Col[]; rows: Record<string, unknown>[]; total: number; truncated: boolean; filter: Record<string, unknown> };

const render = (c: Col) => (r: Record<string, unknown>) => {
  const v = r[c.key];
  if (v == null) return '–';
  if (Array.isArray(v)) return v.join('; ');
  switch (c.type) { case 'money': return fmtIdr(v); case 'pct': return fmtPct(v); case 'number': return Number.isInteger(Number(v)) ? fmtNum(v) : fmtDec(v, 2); case 'date': return fmtDate(v); default: return String(v); }
};

export default function ReportsPage() {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const { filters } = useFilters();
  const cat = useQuery({ queryKey: ['report-catalog'], queryFn: () => api<Catalog>('/reports'), staleTime: 600_000 });
  const key = sp.get('report') ?? cat.data?.[0]?.key;
  const select = (k: string) => { const p = new URLSearchParams(sp.toString()); p.set('report', k); router.replace(`${pathname}?${p.toString()}`, { scroll: false }); };
  const prev = useQuery({ queryKey: ['report', key, filters], queryFn: () => api<Preview>(`/reports/${key}`, { query: filters }), enabled: !!key });
  const p = prev.data;
  return <>
    <PageHeader title="Reports & analytics" description="Preview any report with the active filter; exports (Excel, CSV, PDF) use exactly the same filter." />
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Panel className="self-start"><PanelHeader title="Reports" />
        <nav aria-label="Report catalog"><ul className="py-1">{cat.isLoading ? <li className="p-3"><Skeleton className="h-40" /></li> : (cat.data ?? []).map((r) =>
          <li key={r.key}><button onClick={() => select(r.key)} aria-current={r.key === key ? 'page' : undefined}
            className={cn('block w-full px-4 py-1.5 text-left text-sm hover:bg-surface', r.key === key ? 'bg-primary-soft font-medium text-primary' : 'text-ink-secondary')}>{r.title}</button></li>)}</ul></nav></Panel>
      <div className="min-w-0">
        <FilterBar fields={['dates', 'category', 'region', 'area', 'district', 'supervisor', 'spg']} />
        {prev.error && <ErrorBox error={prev.error} />}
        <Panel><PanelHeader title={p?.title ?? 'Report'} subtitle={p ? `${p.total.toLocaleString('id-ID')} row(s)${p.truncated ? ' · preview limited to 500 rows, export contains all rows' : ''} · ${p.filter.spgsInScope} SPG in scope` : undefined}
          actions={key && <ExportMenu report={key} filters={filters} />} />
          {prev.isLoading ? <PanelBody><Skeleton className="h-72" /></PanelBody> : p && <div className="max-h-[70vh] overflow-auto">
            <SimpleTable rows={p.rows} columns={p.columns.map((c) => ({ key: c.key, label: c.label, align: ['number', 'money', 'pct'].includes(c.type ?? '') ? 'right' as const : undefined, render: render(c) }))} /></div>}
        </Panel>
      </div>
    </div>
  </>;
}

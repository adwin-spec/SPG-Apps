'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDec, fmtIdr, fmtNum, fmtPct, humanize } from '@/lib/format';
import { Chart, SERIES, lineSeries } from '@/components/chart';
import { Stat, StatRow } from '@/components/stat';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PeriodInput, usePeriod } from '@/features/analytics/period';

type Result = { id: string; actualValue: string | null; targetValue: string | null; targetSource: string | null; achievementPct: string | null; scoredPct: string | null; weightPct: string | null; weightedScore: string | null;
  dataStatus: string; formulaVersion: number; trace: { metricKey: string; kind: string; source: string; numerator: number | null; denominator: number | null; spgActiveInPeriod: boolean; finalStatuses: string[]; finalVisitStatuses: string[]; period: { start: string; endExclusive: string; asOf: string }; capPct: number | null } | null;
  kpiDefinition: { code: string; name: string; dimension: string; unit: string; isActivity: boolean; direction: string } };
type Detail = {
  spg: { id: string; fullName: string; employeeCode: string; category: { code: string; name: string }; currentArea: { name: string }; currentSupervisor: { user: { fullName: string } } | null };
  snapshot: { totalScore: string | null; activityScore: string | null; outcomeScore: string | null; weightCoverage: string | null; rankInCategory: number | null; performanceStatus: string | null; isLocked: boolean; computedAt: string; configSnapshot: { policy: string } | null } | null;
  results: Result[]; trend: { periodMonth: string; totalScore: string | null; activityScore: string | null; outcomeScore: string | null }[]; categoryAverage: number | null; categoryCount: number;
};
const fmtVal = (v: unknown, unit: string) => (v == null ? '–' : unit === 'IDR' ? fmtIdr(v, true) : unit === '%' ? fmtPct(v) : fmtDec(v, 2));
const num = (v: unknown) => (v == null ? null : Number(v));

export default function SpgPerformancePage() {
  const { spgId } = useParams<{ spgId: string }>();
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = useQuery({ queryKey: ['performance', 'detail', spgId, period], queryFn: () => api<Detail>(`/performance/spgs/${spgId}`, { query: { period } }) });
  const d = q.data; const s = d?.snapshot;
  const trend = d?.trend ?? [];
  return <>
    <PageHeader title={d ? d.spg.fullName : 'SPG performance'} description={d ? `${d.spg.employeeCode} · ${d.spg.category.name} · ${d.spg.currentArea.name} · Supervisor ${d.spg.currentSupervisor?.user.fullName ?? '–'}` : undefined}
      actions={<><PeriodInput value={period} onChange={setPeriod} /><Link href={`/performance?period=${period}`} className="text-sm text-primary hover:underline">← Ranking</Link></>} />
    {q.error && <ErrorBox error={q.error} />}
    <StatRow cols={6}>
      <Stat loading={q.isLoading} label="Performance score" value={fmtDec(s?.totalScore)} sub={s?.performanceStatus ? <StatusBadge status={s.performanceStatus} /> : 'not computed'} />
      <Stat loading={q.isLoading} label="Rank in category" value={s?.rankInCategory ?? '–'} sub={d && `of ${d.categoryCount} SPG`} />
      <Stat loading={q.isLoading} label="Category average" value={fmtDec(d?.categoryAverage)} delta={s?.totalScore != null && d?.categoryAverage != null ? Number(s.totalScore) - d.categoryAverage : null} sub="vs this SPG" />
      <Stat loading={q.isLoading} label="Activity score" value={fmtDec(s?.activityScore)} hint="Weighted score of activity KPIs (renormalised)" />
      <Stat loading={q.isLoading} label="Business outcome score" value={fmtDec(s?.outcomeScore)} hint="Weighted score of outcome KPIs (renormalised)" />
      <Stat loading={q.isLoading} label="Weight coverage" value={fmtPct(s?.weightCoverage)} hint="Share of KPI weight with scorable data and a defined target. KPIs without data or target are excluded, never scored as zero." sub={s?.configSnapshot?.policy ? humanize(s.configSnapshot.policy) : undefined} />
    </StatRow>

    <Panel className="mt-4"><PanelHeader title="KPI breakdown" subtitle="Click a row to see how the actual value was computed (trace)" actions={s?.isLocked ? <Badge tone="neutral">Locked snapshot</Badge> : undefined} />
      {q.isLoading ? <PanelBody><Skeleton className="h-64" /></PanelBody> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted"><tr>
          {['', 'KPI', 'Dimension', 'Type', 'Actual', 'Target', 'Achievement', 'Scored', 'Weight', 'Weighted', 'Data'].map((h, i) => <th key={i} scope="col" className={`whitespace-nowrap px-3 py-2 ${i >= 4 && i <= 9 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{(d?.results ?? []).map((r) => { const k = r.kpiDefinition; const isOpen = !!open[r.id]; return <Fragment key={r.id}>
          <tr className="cursor-pointer border-t border-border hover:bg-surface/70" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} aria-expanded={isOpen}>
            <td className="w-6 pl-3">{isOpen ? <ChevronDown className="h-4 w-4 text-ink-muted" /> : <ChevronRight className="h-4 w-4 text-ink-muted" />}</td>
            <td className="px-3 py-2"><div className="font-medium">{k.name}</div><div className="text-2xs text-ink-muted">{k.code}{k.direction === 'LOWER_IS_BETTER' ? ' · lower is better' : ''}</div></td>
            <td className="px-3 py-2 text-xs">{humanize(k.dimension)}</td>
            <td className="px-3 py-2"><Badge tone={k.isActivity ? 'info' : 'neutral'}>{k.isActivity ? 'Activity' : 'Outcome'}</Badge></td>
            <td className="num px-3 py-2 text-right">{fmtVal(r.actualValue, k.unit)}</td>
            <td className="num px-3 py-2 text-right">{r.targetValue == null ? <span className="text-ink-muted">Undefined</span> : fmtVal(r.targetValue, k.unit)}{r.targetSource === 'SPG_OVERRIDE' && <div className="text-2xs text-primary">SPG override</div>}</td>
            <td className="num px-3 py-2 text-right">{fmtPct(r.achievementPct)}</td>
            <td className="num px-3 py-2 text-right">{fmtPct(r.scoredPct)}</td>
            <td className="num px-3 py-2 text-right">{fmtPct(r.weightPct)}</td>
            <td className="num px-3 py-2 text-right font-medium">{fmtDec(r.weightedScore, 2)}</td>
            <td className="px-3 py-2"><StatusBadge status={r.dataStatus} /></td>
          </tr>
          {isOpen && <tr className="bg-surface/60"><td /><td colSpan={10} className="px-3 py-3 text-xs">
            {r.trace ? <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-ink-muted">Metric</dt><dd className="font-mono">{r.trace.metricKey} (v{r.formulaVersion}, {r.trace.kind})</dd></div>
              <div><dt className="text-ink-muted">Data source</dt><dd>{r.trace.source}</dd></div>
              <div><dt className="text-ink-muted">Numerator / denominator</dt><dd className="num">{r.trace.numerator == null ? '–' : fmtNum(r.trace.numerator)} / {r.trace.denominator == null ? '–' : fmtNum(r.trace.denominator)}</dd></div>
              <div><dt className="text-ink-muted">Period</dt><dd>{r.trace.period.start} → {r.trace.period.endExclusive} (as of {r.trace.period.asOf})</dd></div>
              <div><dt className="text-ink-muted">Final statuses counted</dt><dd>{r.trace.finalStatuses.join(', ')} · visits: {r.trace.finalVisitStatuses.join(', ')}</dd></div>
              <div><dt className="text-ink-muted">Achievement cap</dt><dd>{r.trace.capPct == null ? 'Uncapped' : `${r.trace.capPct}%`}</dd></div>
              <div><dt className="text-ink-muted">SPG active in period</dt><dd>{r.trace.spgActiveInPeriod ? 'Yes' : 'No – counts are NO_DATA, not zero'}</dd></div>
              <div><dt className="text-ink-muted">Records behind value</dt><dd className="num">{r.trace.denominator ?? (r.trace.numerator != null ? 'aggregate' : 0)}</dd></div>
            </dl> : <span className="text-ink-muted">No trace stored.</span>}
          </td></tr>}
        </Fragment>; })}</tbody></table>
        {!d?.results.length && <p className="px-4 py-8 text-center text-sm text-ink-muted">No KPI results for {period}. Ask an administrator to recalculate the period.</p>}
      </div>}
    </Panel>

    <Panel className="mt-4"><PanelHeader title="Monthly trend" subtitle="Total, activity and outcome scores (0–100)" />
      <PanelBody><Chart ariaLabel="Monthly performance trend" height={240} empty={!trend.length}
        option={{ legend: { data: ['Total', 'Activity', 'Outcome'] }, xAxis: { type: 'category', data: trend.map((t) => t.periodMonth.slice(0, 7)) }, yAxis: { type: 'value', min: 0, max: 100 },
          series: [lineSeries('Total', trend.map((t) => num(t.totalScore)), SERIES[0], { showSymbol: true }), lineSeries('Activity', trend.map((t) => num(t.activityScore)), SERIES[1], { showSymbol: true }), lineSeries('Outcome', trend.map((t) => num(t.outcomeScore)), SERIES[2], { showSymbol: true })] }}
        table={{ columns: ['Period', 'Total', 'Activity', 'Outcome'], rows: trend.map((t) => [t.periodMonth.slice(0, 7), fmtDec(t.totalScore), fmtDec(t.activityScore), fmtDec(t.outcomeScore)]) }} /></PanelBody></Panel>
  </>;
}

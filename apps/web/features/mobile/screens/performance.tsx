'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/offline/use-outbox';
import { fmtDec, fmtNum, fmtPct, humanize } from '@/lib/format';
import { Card, mInput } from '../kit';
import { StatusBadge } from '@/components/ui/badge';

interface Detail { snapshot: { totalScore: string | null; activityScore: string | null; outcomeScore: string | null; rankInCategory: number | null; performanceStatus: string | null; weightCoverage: string | null; computedAt: string } | null;
  results: { id: string; actualValue: string | null; targetValue: string | null; achievementPct: string | null; weightPct: string | null; dataStatus: string; kpiDefinition: { name: string; unit: string; isActivity: boolean } }[];
  categoryAverage: number | null; categoryCount: number }

export function PerformanceScreen() {
  const online = useOnline(); const [period, setPeriod] = useState(jakartaDate().slice(0, 7));
  const q = useQuery({ queryKey: ['my-perf', period], queryFn: () => api<Detail>('/performance/me', { query: { period } }), enabled: online });
  const s = q.data?.snapshot;
  return <div className="space-y-3">
    <Card className="flex items-center justify-between"><h1 className="text-base font-semibold">My KPI</h1><input type="month" aria-label="Period" className={`${mInput} w-40`} value={period} onChange={(e) => setPeriod(e.target.value)} /></Card>
    {!online ? <Card><p className="text-sm text-ink-muted">Performance is calculated on the server – connect to view it.</p></Card> : q.isLoading ? <Card>Loading…</Card> : !s ? <Card><p className="text-sm text-ink-muted">No score yet for this period. Scores are recalculated nightly from approved data.</p></Card> : <>
      <Card className="text-center"><div className="text-xs text-ink-muted">Performance score</div><div className="num text-4xl font-semibold">{fmtDec(s.totalScore)}</div>
        <div className="mt-1 flex justify-center gap-2"><StatusBadge status={s.performanceStatus} /><span className="text-xs text-ink-secondary">Rank {s.rankInCategory ?? '–'} of {q.data?.categoryCount} · category avg {fmtDec(q.data?.categoryAverage)}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-surface p-2">Activity <b className="num">{fmtDec(s.activityScore)}</b></div><div className="rounded-lg bg-surface p-2">Outcome <b className="num">{fmtDec(s.outcomeScore)}</b></div></div>
        <p className="mt-2 text-2xs text-ink-muted">Only approved data counts. KPIs without data or without a target are not scored ({fmtPct(s.weightCoverage)} of weight scored).</p></Card>
      <Card className="p-0"><ul className="divide-y divide-border">{q.data!.results.map((r) => <li key={r.id} className="px-4 py-3">
        <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{r.kpiDefinition.name}</span>{r.dataStatus === 'OK' ? <span className="num text-sm font-semibold">{fmtPct(r.achievementPct)}</span> : <StatusBadge status={r.dataStatus} />}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface"><div className="h-full bg-primary" style={{ width: `${Math.min(100, Number(r.achievementPct ?? 0))}%` }} /></div>
        <div className="mt-1 text-xs text-ink-muted">Actual {fmtNum(r.actualValue)} / target {r.targetValue == null ? 'not set' : fmtNum(r.targetValue)} {r.kpiDefinition.unit} · weight {fmtNum(r.weightPct)}% · {r.kpiDefinition.isActivity ? 'activity' : 'outcome'}</div>
      </li>)}</ul></Card></>}
    {q.error && <Card><p className="text-sm text-critical-text">{(q.error as Error).message}</p></Card>}
    <p className="px-1 text-2xs text-ink-muted">{humanize('weights_and_targets_are_set_by_management')}.</p>
  </div>;
}

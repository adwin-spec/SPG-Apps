'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Lock, RefreshCw } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/use-filters';
import { fmtDec, fmtPct } from '@/lib/format';
import { FilterBar } from '@/components/filter-bar';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PageHeader, Panel } from '@/components/ui/card';
import { PeriodInput, usePeriod } from '@/features/analytics/period';

type Snap = { id: string; spgId: string; totalScore: string | null; activityScore: string | null; outcomeScore: string | null; weightCoverage: string | null; rankInCategory: number | null; performanceStatus: string | null;
  previousScore: number | null; isLocked: boolean; computedAt: string; spg: { fullName: string; employeeCode: string; category: { code: string }; currentArea: { name: string }; currentSupervisor: { user: { fullName: string } } | null } };

function Delta({ cur, prev }: { cur: string | null; prev: number | null }) {
  if (cur == null || prev == null) return null;
  const d = Number(cur) - prev;
  return <span className={`ml-1 text-2xs ${d >= 0 ? 'text-good-text' : 'text-critical-text'}`}>{d >= 0 ? '▲' : '▼'}{Math.abs(d).toFixed(1)}</span>;
}

export default function RankingPage() {
  const { period, setPeriod } = usePeriod();
  const { filters } = useFilters();
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'recalc' | 'lock' | null>(null);
  const columns: ColumnDef<Snap, unknown>[] = [
    { id: 'rank', header: 'Rank', meta: { align: 'right' }, cell: ({ row }) => row.original.rankInCategory ?? '–' },
    { id: 'spg', header: 'SPG', cell: ({ row }) => <Link className="text-primary hover:underline" href={`/performance/${row.original.spgId}?period=${period}`}>{row.original.spg.fullName}</Link> },
    { id: 'category', header: 'Category', cell: ({ row }) => row.original.spg.category.code },
    { id: 'area', header: 'Area', cell: ({ row }) => row.original.spg.currentArea.name },
    { id: 'supervisor', header: 'Supervisor', cell: ({ row }) => row.original.spg.currentSupervisor?.user.fullName ?? '–' },
    { id: 'total', header: 'Score', meta: { align: 'right' }, cell: ({ row }) => <span className="font-semibold">{fmtDec(row.original.totalScore)}<Delta cur={row.original.totalScore} prev={row.original.previousScore} /></span> },
    { id: 'activity', header: 'Activity', meta: { align: 'right' }, cell: ({ row }) => fmtDec(row.original.activityScore) },
    { id: 'outcome', header: 'Outcome', meta: { align: 'right' }, cell: ({ row }) => fmtDec(row.original.outcomeScore) },
    { id: 'coverage', header: 'Weight coverage', meta: { align: 'right' }, cell: ({ row }) => fmtPct(row.original.weightCoverage) },
    { id: 'status', header: 'Status', cell: ({ row }) => <span className="flex items-center gap-1"><StatusBadge status={row.original.performanceStatus} />{row.original.isLocked && <Badge tone="neutral"><Lock className="h-3 w-3" aria-hidden />Locked</Badge>}</span> },
  ];
  const recalc = useMutation({
    mutationFn: () => api<{ categories: { category: string; spgs: number; skippedLocked: number }[]; durationMs: number }>('/performance/recalculate', { method: 'POST', body: { period, category: filters.category } }),
    onSuccess: (r) => { toast('success', `Recalculated ${r.categories.reduce((a, c) => a + c.spgs, 0)} SPG in ${r.durationMs} ms`); qc.invalidateQueries({ queryKey: ['performance'] }); setConfirm(null); },
    onError: (e) => toast('error', (e as Error).message),
  });
  const lock = useMutation({
    mutationFn: () => api<{ locked: number }>('/performance/lock', { method: 'POST', body: { period, category: filters.category } }),
    onSuccess: (r) => { toast('success', `${r.locked} snapshot(s) locked`); qc.invalidateQueries({ queryKey: ['performance'] }); setConfirm(null); },
    onError: (e) => toast('error', (e as Error).message),
  });
  const scope = filters.category ? `SPG ${filters.category}` : 'all categories';
  return <>
    <PageHeader title="Performance ranking" description="Monthly KPI scores. Ranks are within each SPG category. Unvalidated data never enters the final score."
      actions={<>{can(PERMISSIONS.PERFORMANCE_RECALCULATE) && <><Button variant="secondary" onClick={() => setConfirm('recalc')}><RefreshCw className="h-4 w-4" />Recalculate</Button>
        <Button variant="secondary" onClick={() => setConfirm('lock')}><Lock className="h-4 w-4" />Lock period</Button></>}
        <ExportMenu report="spg-ranking" filters={{ ...filters, from: `${period}-01`, to: `${period}-28` }} /></>} />
    <FilterBar fields={['category', 'region', 'area', 'supervisor']} extra={<PeriodInput value={period} onChange={setPeriod} />} />
    <Panel><ServerTable queryKey={['performance', 'ranking']} endpoint="/performance" columns={columns} searchable={false} pageSize={50}
      params={{ period, category: filters.category, regionId: filters.regionId, areaId: filters.areaId, supervisorId: filters.supervisorId }}
      emptyHint="No snapshots for this period yet. Use Recalculate to compute scores." /></Panel>
    <Dialog open={confirm === 'recalc'} onOpenChange={(o) => !o && setConfirm(null)} title={`Recalculate ${period}?`} description={`Recomputes KPI results and snapshots for ${scope}. Locked snapshots are skipped.`}
      footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button loading={recalc.isPending} onClick={() => recalc.mutate()}>Recalculate</Button></>}>
      <p className="text-sm text-ink-secondary">Uses the KPI formulas, weights and targets effective for this period. Only data with a final validation status is counted.</p></Dialog>
    <Dialog open={confirm === 'lock'} onOpenChange={(o) => !o && setConfirm(null)} title={`Lock ${period}?`} description={`Freezes the snapshots for ${scope}.`}
      footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" loading={lock.isPending} onClick={() => lock.mutate()}>Lock snapshots</Button></>}>
      <p className="text-sm text-ink-secondary">Locked snapshots are no longer changed by recalculation. Use this after the monthly review is final. This action is audited.</p></Dialog>
  </>;
}

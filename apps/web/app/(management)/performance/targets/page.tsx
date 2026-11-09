'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtIdr, fmtNum } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PeriodInput, usePeriod } from '@/features/analytics/period';

type Ov = { spgId: string; spg: string; employeeCode: string; value: number; reason: string | null };
type TRow = { kpiDefinitionId: string; code: string; name: string; unit: string; category: string; target: number | null; targetStatus: 'UNDEFINED' | 'ZERO' | 'DEFINED'; reason: string | null; overrides: Ov[] };
type Draft = { kpiDefinitionId: string; spgId: string; value: string; label?: string };
const CATS = ['GROSIR', 'HORECA', 'REGULER'] as const;
const statusOf = (v: string): 'UNDEFINED' | 'ZERO' | 'DEFINED' => (v.trim() === '' ? 'UNDEFINED' : Number(v) === 0 ? 'ZERO' : 'DEFINED');
const STATUS_TONE = { UNDEFINED: 'neutral', ZERO: 'warn', DEFINED: 'good' } as const;
const fmtT = (v: number | null, unit: string) => (v == null ? '–' : unit === 'IDR' ? fmtIdr(v, true) : fmtNum(v));

export default function TargetsPage() {
  const { period, setPeriod } = usePeriod();
  const [cat, setCat] = useState<string>('GROSIR');
  const { can } = useAuth(); const manage = can(PERMISSIONS.TARGET_MANAGE); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['targets', period, cat], queryFn: () => api<TRow[]>('/kpi/targets', { query: { period, category: cat } }) });
  const spgs = useQuery({ queryKey: ['spg-options', cat], queryFn: () => apiPage<{ id: string; fullName: string; employeeCode: string }>('/spgs', { query: { category: cat, pageSize: 200, status: 'ACTIVE' } }), enabled: manage });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [ovEdits, setOvEdits] = useState<Draft[]>([]);
  const [removed, setRemoved] = useState<Draft[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => { setEdits({}); setOvEdits([]); setRemoved([]); }, [period, cat, q.data]);
  const rows = q.data ?? [];
  const valueOf = (r: TRow) => edits[r.kpiDefinitionId] ?? (r.target == null ? '' : String(r.target));
  const changes = useMemo(() => {
    const items: { kpiDefinitionId: string; period: string; value: number | null; spgId?: string; reason: string }[] = [];
    for (const r of rows) {
      const v = edits[r.kpiDefinitionId];
      if (v === undefined) continue;
      const nv = v.trim() === '' ? null : Number(v);
      if (nv !== r.target) items.push({ kpiDefinitionId: r.kpiDefinitionId, period, value: nv, reason });
    }
    for (const o of ovEdits) if (o.spgId && o.value.trim() !== '') items.push({ kpiDefinitionId: o.kpiDefinitionId, period, spgId: o.spgId, value: Number(o.value), reason });
    for (const o of removed) items.push({ kpiDefinitionId: o.kpiDefinitionId, period, spgId: o.spgId, value: null, reason });
    return items;
  }, [rows, edits, ovEdits, removed, period, reason]);
  const invalid = Object.values(edits).some((v) => v.trim() !== '' && (Number.isNaN(Number(v)) || Number(v) < 0)) || ovEdits.some((o) => o.value.trim() !== '' && (Number.isNaN(Number(o.value)) || Number(o.value) < 0));
  const save = useMutation({ mutationFn: () => api<{ changed: number }>('/kpi/targets', { method: 'PUT', body: { items: changes } }),
    onSuccess: (r) => { toast('success', `${r.changed} target(s) saved – recalculate the period to apply`); setReason(''); qc.invalidateQueries({ queryKey: ['targets'] }); },
    onError: (e) => toast('error', (e as Error).message) });

  return <>
    <PageHeader title="Targets" description="Monthly targets per KPI. An empty target means UNDEFINED – it is excluded from scoring and is never treated as 0. A 0 target is stored explicitly (ZERO) and is not scored."
      actions={<PeriodInput value={period} onChange={setPeriod} />} />
    <Tabs value={cat} onValueChange={setCat}><TabsList>{CATS.map((c) => <TabsTrigger key={c} value={c}>SPG {c}</TabsTrigger>)}</TabsList></Tabs>
    {q.error && <ErrorBox error={q.error} />}
    <Panel><PanelHeader title={`Category targets – ${period}`} subtitle="Category default applies to every SPG unless an SPG override exists" />
      {q.isLoading ? <PanelBody><Skeleton className="h-60" /></PanelBody> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted"><tr><th className="px-3 py-2">KPI</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Category target</th><th className="px-3 py-2">State</th><th className="px-3 py-2">SPG overrides</th></tr></thead>
        <tbody>{rows.map((r) => { const v = valueOf(r); const st = statusOf(v); const myOvs = ovEdits.filter((o) => o.kpiDefinitionId === r.kpiDefinitionId);
          return <tr key={r.kpiDefinitionId} className="border-t border-border align-top">
            <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-2xs text-ink-muted">{r.code}</div></td>
            <td className="px-3 py-2 text-xs">{r.unit}</td>
            <td className="px-3 py-2">{manage ? <Input aria-label={`Target for ${r.name}`} inputMode="decimal" value={v} placeholder="Undefined" className="h-8 w-36 text-right num"
              onChange={(e) => setEdits((x) => ({ ...x, [r.kpiDefinitionId]: e.target.value }))} aria-invalid={v.trim() !== '' && Number.isNaN(Number(v))} /> : <span className="num">{fmtT(r.target, r.unit)}</span>}
              {r.reason && <div className="mt-0.5 max-w-[14rem] truncate text-2xs text-ink-muted" title={r.reason}>{r.reason}</div>}</td>
            <td className="px-3 py-2"><Badge tone={STATUS_TONE[st]} icon>{st}</Badge>{edits[r.kpiDefinitionId] !== undefined && statusOf(edits[r.kpiDefinitionId]) !== r.targetStatus && <span className="ml-1 text-2xs text-primary">changed</span>}</td>
            <td className="px-3 py-2"><ul className="space-y-1">
              {r.overrides.filter((o) => !removed.some((x) => x.kpiDefinitionId === r.kpiDefinitionId && x.spgId === o.spgId)).map((o) => <li key={o.spgId} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate">{o.spg}</span><span className="num">{fmtT(o.value, r.unit)}</span>
                {manage && <button className="text-ink-muted hover:text-critical" aria-label={`Remove override for ${o.spg}`} onClick={() => setRemoved((x) => [...x, { kpiDefinitionId: r.kpiDefinitionId, spgId: o.spgId, value: '' }])}><Trash2 className="h-3.5 w-3.5" /></button>}</li>)}
              {myOvs.map((o, i) => { const idx = ovEdits.indexOf(o); return <li key={i} className="flex items-center gap-2">
                <Select aria-label="SPG" value={o.spgId} onChange={(e) => setOvEdits((x) => x.map((y, j) => (j === idx ? { ...y, spgId: e.target.value } : y)))} className="h-8 w-44 text-xs">
                  <option value="">Select SPG…</option>{(spgs.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select>
                <Input aria-label="Override value" inputMode="decimal" value={o.value} onChange={(e) => setOvEdits((x) => x.map((y, j) => (j === idx ? { ...y, value: e.target.value } : y)))} className="h-8 w-28 text-right text-xs" />
                <button className="text-ink-muted hover:text-critical" aria-label="Discard override" onClick={() => setOvEdits((x) => x.filter((_, j) => j !== idx))}><Trash2 className="h-3.5 w-3.5" /></button></li>; })}
              {manage && <li><Button variant="link" size="sm" onClick={() => setOvEdits((x) => [...x, { kpiDefinitionId: r.kpiDefinitionId, spgId: '', value: '' }])}><Plus className="h-3 w-3" />Add SPG override</Button></li>}
            </ul></td></tr>; })}</tbody></table>
        {!rows.length && <p className="px-4 py-8 text-center text-sm text-ink-muted">No active KPIs for this category.</p>}</div>}
      {manage && <div className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3">
        <Field label="Reason for change" required className="min-w-[18rem] flex-1"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[38px]" placeholder="e.g. Q4 target agreed in sales meeting 2026-10-30" /></Field>
        <div className="text-xs text-ink-muted">{changes.length} change(s){invalid && <span className="ml-2 text-critical-text">Fix invalid numbers</span>}</div>
        <Button disabled={!changes.length || reason.trim().length < 3 || invalid} loading={save.isPending} onClick={() => save.mutate()}>Save targets</Button>
      </div>}
    </Panel>
  </>;
}

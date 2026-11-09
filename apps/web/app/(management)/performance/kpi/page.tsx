'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, History, Plus } from 'lucide-react';
import { PERMISSIONS, jakartaDate, kpiDefinitionCreateSchema, kpiFormulaVersionSchema, kpiWeightChangeSchema, type MetricMeta } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtPct, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { ErrorBox, PageHeader, Panel, PanelHeader, Skeleton } from '@/components/ui/card';

type Def = { id: string; code: string; name: string; description: string | null; category: string; dimension: string; unit: string; direction: string; isActivity: boolean; isActive: boolean; displayOrder: number;
  formula: { version: number; metricKey: string; achievementCapPct: string | null; effectiveFrom: string } | null; weightPct: number | null; metric: MetricMeta | null };
type DefList = { definitions: Def[]; weightTotals: Record<string, number>; warnings: string[] };
const CATS = ['GROSIR', 'HORECA', 'REGULER'] as const;
const DIMS = ['PRODUCTIVITY', 'COVERAGE', 'COMMERCIAL', 'EXECUTION', 'INTELLIGENCE', 'DATA_QUALITY', 'REPORTING_COMPLIANCE'];
const nullableNum = (v: unknown) => (v === '' || v == null ? null : Number(v));
const firstOfNextMonth = () => { const d = new Date(`${jakartaDate().slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const metricsFor = (metrics: MetricMeta[], cat: string) => metrics.filter((m) => m.channel === 'ALL' || m.channel === cat);

function CreateDialog({ open, onClose, category, metrics }: { open: boolean; onClose: () => void; category: string; metrics: MetricMeta[] }) {
  const toast = useToast(); const qc = useQueryClient();
  const form = useForm<z.input<typeof kpiDefinitionCreateSchema>>({ resolver: zodResolver(kpiDefinitionCreateSchema),
    defaultValues: { category: category as never, direction: 'HIGHER_IS_BETTER', isActivity: true, displayOrder: 50, params: {}, achievementCapPct: 100, effectiveFrom: firstOfNextMonth(), weightPct: 0, dimension: 'PRODUCTIVITY', unit: '%' } });
  const cat = form.watch('category');
  const m = useMutation({ mutationFn: (v: z.input<typeof kpiDefinitionCreateSchema>) => api('/kpi/definitions', { method: 'POST', body: v }),
    onSuccess: () => { toast('success', 'KPI created'); qc.invalidateQueries({ queryKey: ['kpi-defs'] }); onClose(); form.reset(); }, onError: (e) => toast('error', (e as Error).message) });
  const e = form.formState.errors;
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="New KPI" description="Composed from the server-side metric catalogue – no code change needed." size="lg"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>Create KPI</Button></>}>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      <Field label="Code" required error={e.code?.message} hint="UPPER_SNAKE_CASE"><Input {...form.register('code')} placeholder="GR_NEW_KPI" /></Field>
      <Field label="Name" required error={e.name?.message}><Input {...form.register('name')} /></Field>
      <Field label="SPG category" required><Select {...form.register('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Dimension" required><Select {...form.register('dimension')}>{DIMS.map((d) => <option key={d} value={d}>{humanize(d)}</option>)}</Select></Field>
      <Field label="Metric" required error={e.metricKey?.message} className="sm:col-span-2"><Select {...form.register('metricKey')} onChange={(ev) => { form.setValue('metricKey', ev.target.value); const mm = metrics.find((x) => x.key === ev.target.value); if (mm) { form.setValue('isActivity', mm.isActivity); form.setValue('unit', mm.unit === 'idr' ? 'IDR' : mm.unit === 'pct' ? '%' : mm.unit); } }}>
        <option value="">Select metric…</option>{metricsFor(metrics, String(cat)).map((x) => <option key={x.key} value={x.key}>{x.label} — {x.key}</option>)}</Select></Field>
      <Field label="Unit" required error={e.unit?.message}><Input {...form.register('unit')} /></Field>
      <Field label="Direction"><Select {...form.register('direction')}><option value="HIGHER_IS_BETTER">Higher is better</option><option value="LOWER_IS_BETTER">Lower is better</option></Select></Field>
      <Field label="Type"><Select {...form.register('isActivity', { setValueAs: (v) => v === true || v === 'true' })}><option value="true">Activity KPI</option><option value="false">Business outcome KPI</option></Select></Field>
      <Field label="Weight (%)" required error={e.weightPct?.message}><Input type="number" step="0.5" {...form.register('weightPct', { valueAsNumber: true })} /></Field>
      <Field label="Achievement cap (%)" hint="Empty = uncapped" error={e.achievementCapPct?.message}><Input type="number" {...form.register('achievementCapPct', { setValueAs: nullableNum })} /></Field>
      <Field label="Effective from" required error={e.effectiveFrom?.message}><Input type="date" {...form.register('effectiveFrom')} /></Field>
      <Field label="Description" className="sm:col-span-2"><Textarea {...form.register('description')} /></Field>
    </form>
  </Dialog>;
}

function FormulaDialog({ def, onClose, metrics }: { def: Def; onClose: () => void; metrics: MetricMeta[] }) {
  const toast = useToast(); const qc = useQueryClient();
  const form = useForm<z.input<typeof kpiFormulaVersionSchema>>({ resolver: zodResolver(kpiFormulaVersionSchema),
    defaultValues: { metricKey: def.formula?.metricKey ?? '', params: {}, achievementCapPct: def.formula?.achievementCapPct == null ? null : Number(def.formula.achievementCapPct), effectiveFrom: firstOfNextMonth() } });
  const m = useMutation({ mutationFn: (v: z.input<typeof kpiFormulaVersionSchema>) => api(`/kpi/definitions/${def.id}/formulas`, { method: 'POST', body: v }),
    onSuccess: () => { toast('success', 'New formula version saved'); qc.invalidateQueries({ queryKey: ['kpi-defs'] }); onClose(); }, onError: (e) => toast('error', (e as Error).message) });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`New formula version – ${def.name}`} description={`Current: v${def.formula?.version ?? 0}. The previous version stays effective until the new start date (history kept).`}
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>Save version</Button></>}>
    <div className="grid gap-3">
      <Field label="Metric" error={e.metricKey?.message}><Select {...form.register('metricKey')}>{metricsFor(metrics, def.category).map((x) => <option key={x.key} value={x.key}>{x.label} — {x.key}</option>)}</Select></Field>
      <Field label="Achievement cap (%)" hint="Empty = uncapped" error={e.achievementCapPct?.message}><Input type="number" {...form.register('achievementCapPct', { setValueAs: nullableNum })} /></Field>
      <Field label="Effective from" error={e.effectiveFrom?.message}><Input type="date" {...form.register('effectiveFrom')} /></Field>
    </div>
  </Dialog>;
}

function WeightDialog({ def, onClose }: { def: Def; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const form = useForm<z.input<typeof kpiWeightChangeSchema>>({ resolver: zodResolver(kpiWeightChangeSchema), defaultValues: { weightPct: def.weightPct ?? 0, effectiveFrom: firstOfNextMonth(), reason: '' } });
  const m = useMutation({ mutationFn: (v: z.input<typeof kpiWeightChangeSchema>) => api(`/kpi/definitions/${def.id}/weights`, { method: 'POST', body: v }),
    onSuccess: () => { toast('success', 'Weight change scheduled'); qc.invalidateQueries({ queryKey: ['kpi-defs'] }); onClose(); }, onError: (e) => toast('error', (e as Error).message) });
  const e = form.formState.errors;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`Change weight – ${def.name}`} description={`Current weight ${fmtPct(def.weightPct)}. Keep the category total at 100%.`}
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>Save weight</Button></>}>
    <div className="grid gap-3">
      <Field label="New weight (%)" error={e.weightPct?.message}><Input type="number" step="0.5" {...form.register('weightPct', { valueAsNumber: true })} /></Field>
      <Field label="Effective from" error={e.effectiveFrom?.message}><Input type="date" {...form.register('effectiveFrom')} /></Field>
      <Field label="Reason" required error={e.reason?.message}><Textarea {...form.register('reason')} /></Field>
    </div>
  </Dialog>;
}

type Hist = { formulas: { version: number; metricKey: string; achievementCapPct: string | null; effectiveFrom: string; effectiveTo: string | null }[]; weights: { weightPct: string; effectiveFrom: string; effectiveTo: string | null; reason: string | null }[];
  targets: { periodMonth: string; value: string; isCurrent: boolean; reason: string | null; createdAt: string }[] };
function HistoryDialog({ def, onClose }: { def: Def; onClose: () => void }) {
  const q = useQuery({ queryKey: ['kpi-history', def.id], queryFn: () => api<Hist>(`/kpi/definitions/${def.id}/history`) });
  const th = 'px-2 py-1 text-left text-2xs font-semibold uppercase text-ink-muted';
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`History – ${def.name}`} size="lg">
    {q.isLoading ? <Skeleton className="h-40" /> : <div className="space-y-4 text-sm">
      <div><h3 className="mb-1 font-semibold">Formula versions</h3><table className="w-full"><thead><tr><th className={th}>Ver.</th><th className={th}>Metric</th><th className={th}>Cap</th><th className={th}>Effective</th></tr></thead>
        <tbody>{q.data?.formulas.map((f) => <tr key={f.version} className="border-t border-border"><td className="px-2 py-1">v{f.version}</td><td className="px-2 py-1 font-mono text-xs">{f.metricKey}</td><td className="px-2 py-1">{f.achievementCapPct == null ? 'Uncapped' : `${Number(f.achievementCapPct)}%`}</td><td className="px-2 py-1">{fmtDate(f.effectiveFrom)} → {f.effectiveTo ? fmtDate(f.effectiveTo) : 'current'}</td></tr>)}</tbody></table></div>
      <div><h3 className="mb-1 font-semibold">Weights</h3><table className="w-full"><thead><tr><th className={th}>Weight</th><th className={th}>Effective</th><th className={th}>Reason</th></tr></thead>
        <tbody>{q.data?.weights.map((w, i) => <tr key={i} className="border-t border-border"><td className="px-2 py-1">{fmtPct(w.weightPct)}</td><td className="px-2 py-1">{fmtDate(w.effectiveFrom)} → {w.effectiveTo ? fmtDate(w.effectiveTo) : 'current'}</td><td className="px-2 py-1">{w.reason ?? '–'}</td></tr>)}</tbody></table></div>
      <div><h3 className="mb-1 font-semibold">Category targets</h3><table className="w-full"><thead><tr><th className={th}>Period</th><th className={th}>Value</th><th className={th}>State</th><th className={th}>Reason</th></tr></thead>
        <tbody>{q.data?.targets.map((t, i) => <tr key={i} className="border-t border-border"><td className="px-2 py-1">{t.periodMonth.slice(0, 7)}</td><td className="num px-2 py-1">{Number(t.value).toLocaleString('id-ID')}</td><td className="px-2 py-1">{t.isCurrent ? <Badge tone="good">Current</Badge> : <Badge>Superseded</Badge>}</td><td className="px-2 py-1">{t.reason ?? '–'}</td></tr>)}</tbody></table>
        {!q.data?.targets.length && <p className="text-xs text-ink-muted">No targets ever set (UNDEFINED).</p>}</div>
    </div>}
  </Dialog>;
}

export default function KpiConfigPage() {
  const { can } = useAuth(); const manage = can(PERMISSIONS.KPI_MANAGE); const toast = useToast(); const qc = useQueryClient();
  const [tab, setTab] = useState<string>('GROSIR');
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ kind: 'formula' | 'weight' | 'history'; def: Def } | null>(null);
  const defs = useQuery({ queryKey: ['kpi-defs'], queryFn: () => api<DefList>('/kpi/definitions') });
  const metrics = useQuery({ queryKey: ['kpi-metrics'], queryFn: () => api<MetricMeta[]>('/kpi/metrics'), staleTime: 600_000 });
  const toggle = useMutation({ mutationFn: (d: Def) => api(`/kpi/definitions/${d.id}`, { method: 'PATCH', body: { isActive: !d.isActive } }),
    onSuccess: () => { toast('success', 'KPI updated'); qc.invalidateQueries({ queryKey: ['kpi-defs'] }); }, onError: (e) => toast('error', (e as Error).message) });
  const th = 'whitespace-nowrap px-3 py-2 text-left';
  return <>
    <PageHeader title="KPI configuration" description="KPIs, formulas and weights per SPG category. Every change is effective-dated and versioned; nothing is hard-coded."
      actions={manage && <Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" />New KPI</Button>} />
    {defs.error && <ErrorBox error={defs.error} />}
    {!!defs.data?.warnings.length && <div role="status" className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-warn-soft px-3 py-2 text-sm text-warn-text">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div>{defs.data.warnings.map((w) => <p key={w}>{w}</p>)}</div></div>}
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>{CATS.map((c) => <TabsTrigger key={c} value={c}>SPG {c} <span className="num ml-1 text-2xs text-ink-muted">Σ {fmtPct(defs.data?.weightTotals[c] ?? 0)}</span></TabsTrigger>)}</TabsList>
      {CATS.map((c) => <TabsContent key={c} value={c}>
        <Panel><PanelHeader title={`SPG ${c} KPIs`} subtitle="Weights shown are the currently effective ones. Simulation defaults must be confirmed before go-live." />
          {defs.isLoading ? <Skeleton className="m-4 h-48" /> : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface text-2xs font-semibold uppercase tracking-wide text-ink-muted"><tr><th className={th}>KPI</th><th className={th}>Dimension</th><th className={th}>Type</th><th className={th}>Metric (formula)</th><th className={`${th} text-right`}>Cap</th><th className={`${th} text-right`}>Weight</th><th className={th}>Status</th><th className={th}></th></tr></thead>
            <tbody>{defs.data?.definitions.filter((d) => d.category === c).map((d) => <tr key={d.id} className={`border-t border-border ${d.isActive ? '' : 'opacity-60'}`}>
              <td className="px-3 py-2"><div className="font-medium">{d.name}</div><div className="text-2xs text-ink-muted">{d.code} · {d.unit}{d.direction === 'LOWER_IS_BETTER' ? ' · lower is better' : ''}</div></td>
              <td className="px-3 py-2 text-xs">{humanize(d.dimension)}</td>
              <td className="px-3 py-2"><Badge tone={d.isActivity ? 'info' : 'neutral'}>{d.isActivity ? 'Activity' : 'Outcome'}</Badge></td>
              <td className="px-3 py-2 text-xs"><div>{d.metric?.label ?? d.formula?.metricKey ?? '–'} <span className="text-ink-muted">v{d.formula?.version ?? '–'}</span></div><div className="text-2xs text-ink-muted">{d.metric?.description}</div></td>
              <td className="num px-3 py-2 text-right">{d.formula?.achievementCapPct == null ? 'None' : `${Number(d.formula.achievementCapPct)}%`}</td>
              <td className="num px-3 py-2 text-right font-medium">{fmtPct(d.weightPct)}</td>
              <td className="px-3 py-2"><Badge tone={d.isActive ? 'good' : 'neutral'} icon>{d.isActive ? 'Active' : 'Inactive'}</Badge></td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => setAction({ kind: 'history', def: d })}><History className="h-3.5 w-3.5" />History</Button>
                {manage && <><Button variant="ghost" size="sm" onClick={() => setAction({ kind: 'formula', def: d })}>Formula</Button><Button variant="ghost" size="sm" onClick={() => setAction({ kind: 'weight', def: d })}>Weight</Button>
                  <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === d.id} onClick={() => toggle.mutate(d)}>{d.isActive ? 'Deactivate' : 'Activate'}</Button></>}
              </td></tr>)}</tbody></table></div>}
        </Panel></TabsContent>)}
    </Tabs>
    {create && <CreateDialog open onClose={() => setCreate(false)} category={tab} metrics={metrics.data ?? []} />}
    {action?.kind === 'formula' && <FormulaDialog def={action.def} metrics={metrics.data ?? []} onClose={() => setAction(null)} />}
    {action?.kind === 'weight' && <WeightDialog def={action.def} onClose={() => setAction(null)} />}
    {action?.kind === 'history' && <HistoryDialog def={action.def} onClose={() => setAction(null)} />}
  </>;
}

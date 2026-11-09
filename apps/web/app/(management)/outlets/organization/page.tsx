'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { PERMISSIONS, areaSchema, districtSchema, regionSchema, subdistrictSchema, territorySchema } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader, Panel, PanelBody, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, emptyToNull, useOrgTree, useSupervisors } from '@/features/ops/common';

type Level = 'region' | 'area' | 'district' | 'subdistrict' | 'territory';
const CFG: Record<Level, { label: string; schema: unknown; path: string; parent?: { key: string; label: string } }> = {
  region: { label: 'Region', schema: regionSchema, path: '/organization/regions' },
  area: { label: 'Area', schema: areaSchema, path: '/organization/areas', parent: { key: 'regionId', label: 'Region' } },
  district: { label: 'Kabupaten', schema: districtSchema, path: '/organization/districts', parent: { key: 'areaId', label: 'Area' } },
  subdistrict: { label: 'Kecamatan', schema: subdistrictSchema, path: '/organization/subdistricts', parent: { key: 'districtId', label: 'Kabupaten' } },
  territory: { label: 'Territory', schema: territorySchema, path: '/organization/territories', parent: { key: 'areaId', label: 'Area' } },
};

function CreateDialog({ level, parents, onClose }: { level: Level; parents: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const cfg = CFG[level];
  const form = useForm<FieldValues>({ resolver: zodResolver(cfg.schema as never) });
  const m = useMutation({ mutationFn: (v: FieldValues) => api(cfg.path, { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-tree'] }); toast('success', `${cfg.label} created`); onClose(); } });
  const e = form.formState.errors as Record<string, { message?: string }>;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`Add ${cfg.label}`}
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>Create</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      {cfg.parent && <Field className="sm:col-span-2" label={cfg.parent.label} required error={e[cfg.parent.key]?.message}><Select {...form.register(cfg.parent.key)}><option value="">Select…</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
      <Field label="Code" required error={e.code?.message} hint="Letters, digits, - and _"><Input {...form.register('code')} /></Field>
      <Field label="Name" required error={e.name?.message}><Input {...form.register('name')} /></Field>
      {level === 'territory' && <Field className="sm:col-span-2" label="Description"><Textarea {...form.register('description', { setValueAs: emptyToNull })} /></Field>}
    </form></Dialog>;
}

export default function OrganizationPage() {
  const { can } = useAuth(); const tree = useOrgTree(); const sups = useSupervisors();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<Level | null>(null);
  const t = tree.data ?? [];
  const parents: Record<Level, { id: string; name: string }[]> = {
    region: [], area: t, territory: t.flatMap((r) => r.areas), district: t.flatMap((r) => r.areas),
    subdistrict: t.flatMap((r) => r.areas.flatMap((a) => a.districts.map((d) => ({ id: d.id, name: `${d.name} (${a.name})` })))),
  };
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const Node = ({ id, label, code, depth, hasKids, count }: { id: string; label: string; code: string; depth: number; hasKids: boolean; count?: string }) =>
    <button type="button" onClick={() => hasKids && toggle(id)} className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-surface" style={{ paddingLeft: 8 + depth * 20 }} aria-expanded={hasKids ? !!open[id] : undefined}>
      {hasKids ? (open[id] ? <ChevronDown className="h-4 w-4 text-ink-muted" /> : <ChevronRight className="h-4 w-4 text-ink-muted" />) : <span className="w-4" />}
      <span className="font-medium">{label}</span><span className="text-xs text-ink-muted">{code}</span>{count && <span className="ml-auto text-xs text-ink-muted">{count}</span>}</button>;
  return <>
    <PageHeader title="Organization" description="Company → Region → Area → Kabupaten → Kecamatan, territories and supervisors"
      actions={can(PERMISSIONS.ORG_MANAGE) && <div className="flex flex-wrap gap-1">{(Object.keys(CFG) as Level[]).map((l) => <Button key={l} size="sm" variant="secondary" onClick={() => setDialog(l)}><Plus className="h-3.5 w-3.5" />{CFG[l].label}</Button>)}</div>} />
    {tree.error && <ErrorBox error={tree.error} />}
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Territorial hierarchy" subtitle="Click to expand" />
        <PanelBody className="p-2">{tree.isLoading ? <Skeleton className="h-40" /> : t.map((r) => <div key={r.id}>
          <Node id={r.id} label={r.name} code={r.code} depth={0} hasKids={!!r.areas.length} count={`${r.areas.length} area(s)`} />
          {open[r.id] && r.areas.map((a) => <div key={a.id}>
            <Node id={a.id} label={a.name} code={a.code} depth={1} hasKids={!!a.districts.length} count={`${a.districts.length} kabupaten`} />
            {open[a.id] && a.districts.map((d) => <div key={d.id}>
              <Node id={d.id} label={d.name} code={d.code} depth={2} hasKids={!!d.subdistricts.length} count={`${d.subdistricts.length} kecamatan`} />
              {open[d.id] && d.subdistricts.map((s) => <Node key={s.id} id={s.id} label={s.name} code={s.code} depth={3} hasKids={false} />)}
            </div>)}
          </div>)}
        </div>)}</PanelBody></Panel>
      <Panel><PanelHeader title={`Supervisors (${sups.data?.length ?? 0})`} />
        <SimpleTable rows={(sups.data ?? []) as unknown as Record<string, unknown>[]} columns={[{ key: 'fullName', label: 'Supervisor' }, { key: 'email', label: 'Email' }, { key: 'areaName', label: 'Area' },
          { key: 'spgCount', label: 'SPG', align: 'right' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> }]} /></Panel>
    </div>
    {dialog && <CreateDialog level={dialog} parents={parents[dialog]} onClose={() => setDialog(null)} />}
  </>;
}

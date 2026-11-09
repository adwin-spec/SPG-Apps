'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { PageHeader, Panel, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox } from '@/features/ops/common';

type Setting = { key: string; value: unknown; description: string | null; isSimulationDefault: boolean; updatedAt: string };
const typeOf = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

function EditDialog({ s, onClose }: { s: Setting; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const t = typeOf(s.value);
  const [text, setText] = useState(t === 'object' || t === 'array' ? JSON.stringify(s.value, null, 2) : String(s.value));
  const [confirm, setConfirm] = useState(false); const [err, setErr] = useState<string | null>(null);
  const parse = (): unknown => {
    if (t === 'number') { const n = Number(text); if (text.trim() === '' || !Number.isFinite(n)) throw new Error('Enter a valid number'); return n; }
    if (t === 'boolean') return text === 'true';
    if (t === 'string') return text;
    const v = JSON.parse(text); if (typeOf(v) !== t) throw new Error(`Value must be a JSON ${t}`); return v;
  };
  const m = useMutation({ mutationFn: (value: unknown) => api(`/settings/${encodeURIComponent(s.key)}`, { method: 'PUT', body: { value, confirmProductionValue: confirm } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast('success', 'Setting saved (takes effect within 60 s)'); onClose(); } });
  const save = () => { setErr(null); try { m.mutate(parse()); } catch (e) { setErr(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : (e as Error).message); } };
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={s.key} description={s.description ?? undefined} size="lg"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={save}>Save</Button></>}>
    <ApiErrorBox error={m.error} />{err && <p role="alert" className="mb-2 text-sm text-critical-text">{err}</p>}
    <Field label={`Value (${t})`}>{t === 'boolean' ? <Select value={text} onChange={(e) => setText(e.target.value)}><option value="true">true</option><option value="false">false</option></Select>
      : t === 'object' || t === 'array' ? <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[260px] font-mono text-xs" spellCheck={false} />
      : <Input value={text} onChange={(e) => setText(e.target.value)} inputMode={t === 'number' ? 'decimal' : undefined} />}</Field>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
      <span>Confirm as production value <span className="block text-xs text-ink-muted">Removes the “simulation default” flag. Only tick this when management has approved the value.</span></span></label>
  </Dialog>;
}

export default function SettingsPage() {
  const { can } = useAuth(); const [edit, setEdit] = useState<Setting | null>(null);
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Setting[]>('/settings') });
  const pending = (q.data ?? []).filter((s) => s.isSimulationDefault).length;
  const groups = [...new Set((q.data ?? []).map((s) => s.key.split('.')[0]))];
  return <>
    <PageHeader title="System settings" description="Configurable business rules. Undecided policies are seeded as simulation defaults and must be confirmed before go-live." />
    {pending > 0 && <div className="mb-4 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn-text"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span><b>{pending} setting(s) still use simulation defaults.</b> KPI scores, lateness and geofence decisions depend on them – review and confirm each with management.</span></div>}
    {q.error && <ErrorBox error={q.error} />}
    {q.isLoading ? <Skeleton className="h-64" /> : groups.map((g) => <Panel key={g} className="mb-4"><PanelHeader title={g.charAt(0).toUpperCase() + g.slice(1)} />
      <ul>{(q.data ?? []).filter((s) => s.key.split('.')[0] === g).map((s) => <li key={s.key} className="flex flex-wrap items-start gap-3 border-t border-border px-4 py-2.5 first:border-0">
        <div className="min-w-[260px] flex-1"><div className="flex items-center gap-2 font-mono text-xs font-semibold">{s.key}{s.isSimulationDefault ? <span title="Simulation default – confirm before go-live"><Badge tone="warn" icon>Simulation default</Badge></span> : <Badge tone="good" icon>Confirmed</Badge>}</div>
          <p className="mt-0.5 text-xs text-ink-secondary">{s.description}</p></div>
        <code className="max-w-md flex-1 truncate rounded bg-surface px-2 py-1 text-xs" title={JSON.stringify(s.value)}>{JSON.stringify(s.value)}</code>
        <span className="text-2xs text-ink-muted">{fmtDateTime(s.updatedAt)}</span>
        {can(PERMISSIONS.SETTINGS_MANAGE) && <Button size="sm" variant="secondary" onClick={() => setEdit(s)}>Edit</Button>}
      </li>)}</ul></Panel>)}
    {edit && <EditDialog s={edit} onClose={() => setEdit(null)} />}
  </>;
}

'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useFilters } from '@/lib/use-filters';
import { fmtDateTime } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel, PanelHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Log = { id: string; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; reason: string | null; ip: string | null; createdAt: string; actor: { fullName: string; email: string } | null };

function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === 'object' && !Array.isArray(before) ? before : null) as Record<string, unknown> | null;
  const a = (after && typeof after === 'object' && !Array.isArray(after) ? after : null) as Record<string, unknown> | null;
  if (!b && !a) return <p className="text-xs text-ink-muted">No payload</p>;
  if (!b || !a) return <pre className="max-h-80 overflow-auto rounded bg-surface p-2 text-xs">{JSON.stringify(after ?? before, null, 2)}</pre>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return <table className="w-full text-xs"><thead><tr className="text-left text-ink-muted"><th className="px-2 py-1">Field</th><th className="px-2 py-1">Before</th><th className="px-2 py-1">After</th></tr></thead>
    <tbody>{keys.map((k) => { const changed = JSON.stringify(b[k]) !== JSON.stringify(a[k]);
      return <tr key={k} className={changed ? 'bg-warn-soft/60' : ''}><td className="px-2 py-1 font-mono">{k}</td><td className="px-2 py-1 font-mono text-critical-text">{JSON.stringify(b[k]) ?? '–'}</td><td className="px-2 py-1 font-mono text-good-text">{JSON.stringify(a[k]) ?? '–'}</td></tr>; })}</tbody></table>;
}

export default function AuditPage() {
  const { filters } = useFilters();
  const [entityType, setEntityType] = useState(''); const [action, setAction] = useState(''); const [entityId, setEntityId] = useState('');
  const [open, setOpen] = useState<Log | null>(null);
  const columns: ColumnDef<Log, unknown>[] = [
    { id: 'x', header: '', cell: ({ row }) => open?.id === row.original.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> },
    { id: 'createdAt', header: 'Time (WIB)', cell: ({ row }) => fmtDateTime(row.original.createdAt) },
    { id: 'actor', header: 'Actor', cell: ({ row }) => row.original.actor?.fullName ?? <span className="text-ink-muted">System</span> },
    { id: 'action', header: 'Action', cell: ({ row }) => <Badge tone={/REJECT|DEACTIVATE|REVERSE|FAILED/.test(row.original.action) ? 'critical' : /OVERRIDE|CORRECT|SUPERSEDE/.test(row.original.action) ? 'warn' : 'neutral'}>{row.original.action}</Badge> },
    { id: 'entity', header: 'Entity', cell: ({ row }) => <span><span className="font-medium">{row.original.entityType}</span> <span className="font-mono text-2xs text-ink-muted">{row.original.entityId?.slice(0, 8)}</span></span> },
    { id: 'reason', header: 'Reason', cell: ({ row }) => <span className="line-clamp-1 max-w-xs">{row.original.reason ?? '–'}</span> },
    { id: 'ip', header: 'IP', cell: ({ row }) => row.original.ip ?? '–' },
  ];
  return <>
    <PageHeader title="Audit trail" description="Append-only record of every change (protected by a database trigger – rows cannot be edited or deleted)" />
    <FilterBar fields={['dates']} extra={<>
      <Input aria-label="Entity type" placeholder="Entity type (e.g. RetailerTransaction)" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-8 w-56 text-xs" />
      <Input aria-label="Action" placeholder="Action (e.g. APPROVE)" value={action} onChange={(e) => setAction(e.target.value.toUpperCase())} className="h-8 w-40 text-xs" />
      <Input aria-label="Entity ID" placeholder="Entity ID" value={entityId} onChange={(e) => setEntityId(e.target.value.trim())} className="h-8 w-64 text-xs" /></>} />
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel><ServerTable<Log> queryKey={['audit']} endpoint="/audit-logs" columns={columns} searchable={false} dense
        params={{ from: filters.from, to: filters.to, entityType: entityType || undefined, action: action || undefined, entityId: entityId || undefined }} onRowClick={(r) => setOpen((o) => (o?.id === r.id ? null : r))} /></Panel>
      <Panel className="xl:sticky xl:top-20 xl:self-start"><PanelHeader title={open ? `${open.action} · ${open.entityType}` : 'Change detail'} subtitle={open ? `${fmtDateTime(open.createdAt)} · ${open.actor?.email ?? 'system'}` : 'Select a row to see the before / after values'} />
        <div className="max-h-[70vh] overflow-auto p-3">{open ? <><DiffView before={open.before} after={open.after} />{open.reason && <p className="mt-2 text-xs"><b>Reason:</b> {open.reason}</p>}
          {open.entityId && <p className="mt-1 break-all font-mono text-2xs text-ink-muted">{open.entityId}</p>}</> : null}</div></Panel>
    </div>
  </>;
}

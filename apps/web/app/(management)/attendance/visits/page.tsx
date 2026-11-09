'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { useFilters } from '@/lib/use-filters';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader, Panel } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge, StatusBadge } from '@/components/ui/badge';

type Visit = { id: string; visitDate: string; checkInAt: string; checkOutAt: string | null; durationMin: number | null; channel: string; isPlanned: boolean; geofenceStatus: string; checkInDistanceM: number | null;
  status: string; validationStatus: string; source: string; overrideReason: string | null; spg: { fullName: string; employeeCode: string }; outlet: { name: string; code: string; channel: string }; _count: { evidence: number } };

const columns: ColumnDef<Visit, unknown>[] = [
  { id: 'date', header: 'Date', cell: ({ row }) => fmtDate(row.original.visitDate) },
  { id: 'spg', header: 'SPG', cell: ({ row }) => row.original.spg.fullName },
  { id: 'outlet', header: 'Outlet', cell: ({ row }) => <span><span className="font-medium text-primary">{row.original.outlet.name}</span> <span className="text-xs text-ink-muted">{row.original.outlet.code}</span></span> },
  { id: 'channel', header: 'Channel', cell: ({ row }) => <Badge>{row.original.channel}</Badge> },
  { id: 'in', header: 'In → Out', cell: ({ row }) => <span className="whitespace-nowrap text-xs">{fmtDateTime(row.original.checkInAt).split(' ').pop()} → {row.original.checkOutAt ? fmtDateTime(row.original.checkOutAt).split(' ').pop() : '…'}</span> },
  { id: 'dur', header: 'Min', meta: { align: 'right' }, cell: ({ row }) => row.original.durationMin ?? '–' },
  { id: 'plan', header: 'Plan', cell: ({ row }) => row.original.isPlanned ? <Badge tone="info">Planned</Badge> : <Badge>Unplanned</Badge> },
  { id: 'geo', header: 'Geofence', cell: ({ row }) => <span className="inline-flex items-center gap-1"><StatusBadge status={row.original.geofenceStatus} />{row.original.checkInDistanceM != null && <span className="num whitespace-nowrap text-2xs text-ink-muted">{row.original.checkInDistanceM} m</span>}</span> },
  { id: 'ev', header: 'Photos', meta: { align: 'right' }, cell: ({ row }) => row.original._count.evidence },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { id: 'val', header: 'Validation', cell: ({ row }) => <span className="inline-flex gap-1"><StatusBadge status={row.original.validationStatus} />{row.original.overrideReason && <Badge tone="serious">Override</Badge>}</span> },
];

export default function VisitsPage() {
  const router = useRouter(); const sp = useSearchParams(); const { filters } = useFilters();
  const [channel, setChannel] = useState(sp.get('channel') ?? '');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [geo, setGeo] = useState(sp.get('geofenceStatus') ?? '');
  const outletId = sp.get('outletId') ?? undefined;
  const sel = (label: string, v: string, set: (s: string) => void, opts: string[]) => <Select aria-label={label} value={v} onChange={(e) => set(e.target.value)} className="h-8 w-auto text-xs"><option value="">{label}: all</option>{opts.map((o) => <option key={o}>{o}</option>)}</Select>;
  return <>
    <PageHeader title="Visits" description={outletId ? 'Visits filtered to one outlet' : 'Outlet visits with GPS geofence, planned vs actual and evidence'} />
    <FilterBar fields={['dates', 'spg']} extra={<>
      {sel('Channel', channel, setChannel, ['WHOLESALER', 'RETAILER', 'HORECA', 'REGULAR'])}{sel('Status', status, setStatus, ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])}{sel('Geofence', geo, setGeo, ['INSIDE', 'OUTSIDE', 'UNKNOWN'])}</>} />
    <Panel><ServerTable<Visit> queryKey={['visits']} endpoint="/visits" columns={columns} searchable={false}
      params={{ from: sp.get('from') ?? filters.from, to: sp.get('to') ?? filters.to, spgId: filters.spgId, outletId, channel: channel || undefined, status: status || undefined, geofenceStatus: geo || undefined }}
      onRowClick={(r) => router.push(`/attendance/visits/${r.id}`)} /></Panel>
  </>;
}

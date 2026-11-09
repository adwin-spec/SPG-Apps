'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { PageHeader, Panel } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/format';
import { MiniSelect, useOutletOptions } from '@/features/business/common';

type O = { id: string; code: string; name: string; status: string; firstRecordedAt: string; category: { name: string } | null; district: { name: string }; subdistrict: { name: string } | null };
const cols: ColumnDef<O, unknown>[] = [
  { id: 'code', header: 'Retailer ID', cell: ({ row }) => <span className="font-medium text-primary">{row.original.code}</span> },
  { id: 'name', header: 'Name', cell: ({ row }) => row.original.name },
  { id: 'type', header: 'Outlet type', cell: ({ row }) => row.original.category?.name ?? '–' },
  { id: 'loc', header: 'Kabupaten / Kecamatan', cell: ({ row }) => `${row.original.district.name}${row.original.subdistrict ? ` / ${row.original.subdistrict.name}` : ''}` },
  { id: 'createdAt', header: 'First recorded', cell: ({ row }) => fmtDate(row.original.firstRecordedAt) },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];
export default function RetailersPage() {
  const router = useRouter(); const [ws, setWs] = useState(''); const [status, setStatus] = useState('');
  const wsOpts = useOutletOptions('WHOLESALER');
  return <>
    <PageHeader title="Retailers" description="Retailers buying from wholesalers. One retailer can be linked to several wholesalers (primary + alternatives)." />
    <Panel><ServerTable<O> queryKey={['outlets', 'RETAILER']} endpoint="/outlets" params={{ channel: 'RETAILER', wholesalerId: ws || undefined, status: status || undefined }} columns={cols} sortable={['name', 'code', 'createdAt', 'status']}
      searchPlaceholder="Name or code (fuzzy)…" onRowClick={(r) => router.push(`/grosir/retailers/${r.id}`)}
      toolbar={<><MiniSelect label="Wholesaler" value={ws} onChange={setWs} options={(wsOpts.data?.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        <MiniSelect label="Status" value={status} onChange={setStatus} options={['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED']} /></>} /></Panel>
  </>;
}

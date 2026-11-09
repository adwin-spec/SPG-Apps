'use client';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerTable } from '@/components/data-table';
import { ExportMenu } from '@/components/export-menu';
import { PageHeader, Panel } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

type O = { id: string; code: string; name: string; status: string; picName: string | null; district: { name: string; area: { name: string } }; subdistrict: { name: string } | null; assignedSpg: { fullName: string } | null };
const cols: ColumnDef<O, unknown>[] = [
  { id: 'code', header: 'Grosir ID', cell: ({ row }) => <span className="font-medium text-primary">{row.original.code}</span> },
  { id: 'name', header: 'Name', cell: ({ row }) => row.original.name },
  { id: 'loc', header: 'Kabupaten / Kecamatan', cell: ({ row }) => `${row.original.district.name}${row.original.subdistrict ? ` / ${row.original.subdistrict.name}` : ''}` },
  { id: 'area', header: 'Area', cell: ({ row }) => row.original.district.area.name },
  { id: 'pic', header: 'PIC', cell: ({ row }) => row.original.picName ?? '–' },
  { id: 'spg', header: 'Assigned SPG', cell: ({ row }) => row.original.assignedSpg?.fullName ?? <span className="text-ink-muted">Unassigned</span> },
  { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];
export default function WholesalersPage() {
  const router = useRouter();
  return <>
    <PageHeader title="Wholesalers (grosir)" description="Open a wholesaler for retailer coverage, product movement, competitor dominance, stock and retailer potential." actions={<ExportMenu report="wholesale-performance" filters={{}} />} />
    <Panel><ServerTable<O> queryKey={['outlets', 'WHOLESALER']} endpoint="/outlets" params={{ channel: 'WHOLESALER' }} columns={cols} sortable={['name', 'code', 'status']} searchPlaceholder="Name or code…" onRowClick={(r) => router.push(`/grosir/wholesalers/${r.id}`)} /></Panel>
  </>;
}

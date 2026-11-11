'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassContainer } from '@/components/ui/glass-container';
import { GlassTable, Pagination, usePaged } from '@/components/ui/glass-table';
import { PageContainer, PageHeader } from '@/components/layout/page-container';

type Row = { at: string; user: string; action: string; entity: string; entityId?: string; detail?: unknown };
export default function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<Row[]>('/admin/audit', { query: { limit: 1000 } }) });
  const pg = usePaged(q.data ?? [], 30);
  return <PageContainer preset="data"><PageHeader eyebrow="Sistem" title="Log audit" description="Catatan perubahan oleh siapa dan kapan. Tidak bisa diubah atau dihapus (dijaga database)." />
    {q.isLoading ? <Skeleton className="h-64" /> : !q.data?.length ? <GlassContainer><EmptyState title="Belum ada catatan" /></GlassContainer> :
    <GlassContainer className="enter overflow-hidden"><GlassTable plain><thead><tr>{['Waktu', 'Pengguna', 'Tindakan', 'Data', 'Rincian'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{pg.slice.map((a, i) => <tr key={i}><td className="whitespace-nowrap">{fmtDateTime(a.at)}</td><td className="font-medium">{a.user}</td><td>{a.action}</td>
        <td>{a.entity}{a.entityId ? <span className="text-ink-muted"> · {a.entityId.slice(0, 8)}</span> : null}</td><td className="max-w-md truncate font-mono text-2xs text-ink-muted">{a.detail ? JSON.stringify(a.detail) : ''}</td></tr>)}</tbody></GlassTable>
      <Pagination {...pg} /></GlassContainer>}
  </PageContainer>;
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassContainer } from '@/components/ui/glass-container';
import { GlassTable, Pagination, usePaged } from '@/components/ui/glass-table';
import { PageContainer, PageHeader } from '@/components/layout/page-container';

type Row = { at: string; user: string; action: string; entity: string; entityId?: string; detail?: any };
const ACTION: Record<string, string> = { CREATE: 'Membuat', UPDATE: 'Mengubah', APPROVE: 'Menyetujui', REJECT: 'Menolak', DELETE: 'Menghapus laporan',
  DELETE_ENTRY: 'Menghapus isian', RESTORE: 'Memulihkan', ADD_COVERAGE: 'Menambah wilayah', REMOVE_COVERAGE: 'Melepas wilayah', LOAD_SAMPLES: 'Memuat data contoh', CLEAR_SAMPLES: 'Menghapus data contoh' };
const detailText = (a: Row) => (a.action === 'DELETE_ENTRY' && a.detail ? `${a.detail.label} – ${a.detail.reason}` : a.action === 'DELETE' && a.detail?.reason ? a.detail.reason : a.detail ? JSON.stringify(a.detail) : '');
export default function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<Row[]>('/admin/audit', { query: { limit: 1000 } }) });
  const pg = usePaged(q.data ?? [], 30);
  return <PageContainer preset="data"><PageHeader eyebrow="Sistem" title="Log audit" description="Catatan perubahan oleh siapa dan kapan. Tidak bisa diubah atau dihapus (dijaga database)." />
    {q.isLoading ? <Skeleton className="h-64" /> : !q.data?.length ? <GlassContainer><EmptyState title="Belum ada catatan" /></GlassContainer> :
    <GlassContainer className="enter overflow-hidden"><GlassTable plain><thead><tr>{['Waktu', 'Pengguna', 'Tindakan', 'Data', 'Rincian'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{pg.slice.map((a, i) => <tr key={i}><td className="whitespace-nowrap">{fmtDateTime(a.at)}</td><td className="font-medium">{a.user}</td><td className={a.action.startsWith('DELETE') ? 'font-medium text-critical-text' : undefined}>{ACTION[a.action] ?? a.action}</td>
        <td>{a.entity}{a.entityId ? <span className="text-ink-muted"> · {a.entityId.slice(0, 8)}</span> : null}</td><td className={cn('max-w-md truncate text-ink-muted', a.action === 'DELETE_ENTRY' || a.action === 'DELETE' ? 'text-xs' : 'font-mono text-2xs')} title={detailText(a)}>{detailText(a)}</td></tr>)}</tbody></GlassTable>
      <Pagination {...pg} /></GlassContainer>}
  </PageContainer>;
}

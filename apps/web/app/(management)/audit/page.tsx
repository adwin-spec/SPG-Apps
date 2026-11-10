'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';

export default function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<{ at: string; user: string; action: string; entity: string; entityId?: string; detail?: unknown }[]>('/admin/audit') });
  return <><PageHeader title="Log audit" description="Catatan perubahan oleh siapa dan kapan. Tidak bisa diubah atau dihapus (dijaga database)." />
    <div className="overflow-x-auto rounded-md border-2 border-ink bg-paper-card shadow-hard"><table className="w-full text-[13px]"><thead><tr className="bg-surface text-left text-2xs uppercase text-ink-muted">{['Waktu', 'Pengguna', 'Tindakan', 'Data', 'Rincian'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
      <tbody>{(q.data ?? []).map((a, i) => <tr key={i} className="border-t border-border align-top"><td className="whitespace-nowrap px-3 py-2">{fmtDateTime(a.at)}</td><td className="px-3 py-2">{a.user}</td><td className="px-3 py-2">{a.action}</td>
        <td className="px-3 py-2">{a.entity}{a.entityId ? <span className="text-ink-muted"> · {a.entityId.slice(0, 8)}</span> : null}</td><td className="max-w-md truncate px-3 py-2 font-mono text-2xs text-ink-muted">{a.detail ? JSON.stringify(a.detail) : ''}</td></tr>)}</tbody></table></div></>;
}

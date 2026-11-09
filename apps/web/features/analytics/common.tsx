'use client';
import { Panel, PanelHeader } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';

export type Row = Record<string, unknown>;

/** A titled list panel with a count in the header. */
export function ListPanel({ title, subtitle, rows, columns, max = 15, actions }: { title: string; subtitle?: string; rows: Row[]; columns: { key: string; label: string; align?: 'right'; render?: (r: Row) => React.ReactNode }[]; max?: number; actions?: React.ReactNode }) {
  return <Panel>
    <PanelHeader title={<span>{title} <span className="num ml-1 rounded bg-surface px-1.5 py-0.5 text-2xs font-semibold text-ink-secondary">{rows.length}</span></span>} subtitle={subtitle} actions={actions} />
    <div className="max-h-[360px] overflow-y-auto"><SimpleTable rows={rows} columns={columns} max={max} /></div>
    {rows.length > max && <p className="border-t border-border px-3 py-2 text-2xs text-ink-muted">Showing {max} of {rows.length}</p>}
  </Panel>;
}

export function currentPeriod() {
  const d = new Date(Date.now() + 7 * 3600e3);
  return d.toISOString().slice(0, 7);
}

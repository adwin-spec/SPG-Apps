'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiPage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Empty, ErrorBox, Skeleton } from './ui/card';

export interface ServerTableProps<T> {
  queryKey: unknown[];
  endpoint: string;
  columns: ColumnDef<T, unknown>[];
  params?: Record<string, unknown>;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  /** column ids that the API accepts in `sort=` */
  sortable?: string[];
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  emptyHint?: string;
  dense?: boolean;
}

/** Server-side paginated / searched / sorted table – never loads a full dataset into the browser. */
export function ServerTable<T>({ queryKey, endpoint, columns, params, searchable = true, searchPlaceholder = 'Search…', pageSize = 25, sortable = [], onRowClick, toolbar, emptyHint, dense }: ServerTableProps<T>) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<string | undefined>();
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = useQuery({
    queryKey: [...queryKey, params, page, debounced, sort],
    queryFn: () => apiPage<T>(endpoint, { query: { ...params, page, pageSize, q: debounced || undefined, sort } }),
    placeholderData: keepPreviousData,
  });
  const table = useReactTable({ data: query.data?.data ?? [], columns, getCoreRowModel: getCoreRowModel(), manualPagination: true });
  const meta = query.data?.meta;
  const toggleSort = (id: string) => { if (!sortable.includes(id)) return; setSort((s) => (s === `${id}:desc` ? `${id}:asc` : `${id}:desc`)); };

  return <div>
    {(searchable || toolbar) && <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      {searchable && <div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden />
        <Input aria-label="Search" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>}
      <div className="ml-auto flex items-center gap-2">{toolbar}</div>
    </div>}
    {query.error ? <div className="p-3"><ErrorBox error={query.error} /></div> : null}
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => {
            const id = h.column.id; const s = sort?.startsWith(`${id}:`) ? sort.split(':')[1] : null;
            return <th key={h.id} scope="col" className={cn('whitespace-nowrap px-3 py-2', sortable.includes(id) && 'cursor-pointer select-none hover:text-ink', (h.column.columnDef.meta as { align?: string })?.align === 'right' && 'text-right')}
              onClick={() => toggleSort(id)} aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : undefined}>
              <span className="inline-flex items-center gap-1">{flexRender(h.column.columnDef.header, h.getContext())}{s === 'asc' ? <ArrowUp className="h-3 w-3" /> : s === 'desc' ? <ArrowDown className="h-3 w-3" /> : null}</span>
            </th>; })}</tr>)}
        </thead>
        <tbody>
          {query.isLoading ? Array.from({ length: 6 }).map((_, i) => <tr key={i} className="border-t border-border">{columns.map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>)}</tr>)
            : table.getRowModel().rows.map((r) => <tr key={r.id} onClick={onRowClick ? () => onRowClick(r.original) : undefined}
              className={cn('border-t border-border hover:bg-surface/70', onRowClick && 'cursor-pointer', query.isFetching && 'opacity-60')}>
              {r.getVisibleCells().map((c) => <td key={c.id} className={cn('px-3', dense ? 'py-1.5' : 'py-2', (c.column.columnDef.meta as { align?: string })?.align === 'right' && 'num text-right')}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
            </tr>)}
        </tbody>
      </table>
      {!query.isLoading && meta?.total === 0 && <Empty title="No records match" hint={emptyHint} />}
    </div>
    {meta && meta.total > 0 && <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-ink-secondary">
      <span className="num">{(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total.toLocaleString('id-ID')}</span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="num px-2">Page {meta.page} / {meta.totalPages}</span>
        <Button variant="secondary" size="icon" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>}
  </div>;
}

/** Static table for already-aggregated rows (dashboards). */
export function SimpleTable<T extends Record<string, unknown>>({ rows, columns, max }: { rows: T[]; columns: { key: string; label: string; align?: 'right'; render?: (row: T) => React.ReactNode }[]; max?: number }) {
  if (!rows.length) return <Empty />;
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead className="bg-surface text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted"><tr>{columns.map((c) => <th key={c.key} scope="col" className={cn('whitespace-nowrap px-3 py-2', c.align === 'right' && 'text-right')}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.slice(0, max ?? rows.length).map((r, i) => <tr key={i} className="border-t border-border">{columns.map((c) => <td key={c.key} className={cn('px-3 py-1.5', c.align === 'right' && 'num text-right')}>{c.render ? c.render(r) : String(r[c.key] ?? '–')}</td>)}</tr>)}</tbody>
  </table></div>;
}

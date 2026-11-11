'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassContainer } from './glass-container';

/** Bingkai tabel: kontainer glass, header lengket & lebih solid, baris dengan hover/terpilih (gaya di .glass-table). */
export function GlassTable({ children, className, maxHeight, plain }: { children: React.ReactNode; className?: string; maxHeight?: string; plain?: boolean }) {
  const inner = <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}><table className="glass-table">{children}</table></div>;
  return plain ? inner : <GlassContainer className={cn('overflow-hidden', className)}>{inner}</GlassContainer>;
}

/** Halaman tabel di sisi klien. */
export function usePaged<T>(rows: T[], size = 25) {
  const [page, setPage] = useState(1); const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { if (page > pages) setPage(1); }, [pages, page]);
  return { page, pages, setPage, slice: rows.slice((page - 1) * size, page * size), total: rows.length, size };
}
export function Pagination({ page, pages, setPage, total, size }: { page: number; pages: number; setPage: (p: number) => void; total: number; size: number }) {
  if (pages <= 1) return null;
  return <nav aria-label="Halaman" className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-ink-muted">
    <span>{(page - 1) * size + 1}–{Math.min(page * size, total)} dari {total}</span>
    <span className="flex items-center gap-1">
      <button className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Sebelumnya"><ChevronLeft className="h-4 w-4" /></button>
      <span className="num px-1 font-semibold text-ink">{page} / {pages}</span>
      <button className="rounded-full p-1.5 hover:bg-black/5 disabled:opacity-30" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Berikutnya"><ChevronRight className="h-4 w-4" /></button>
    </span></nav>;
}

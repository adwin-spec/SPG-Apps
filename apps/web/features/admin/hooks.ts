'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { KabRow } from '@/lib/types';

export const useWilayah = (inactive = false) => useQuery({ queryKey: ['wilayah', inactive], queryFn: () => api<KabRow[]>('/wilayah', { query: { include_inactive: inactive || undefined } }), staleTime: 300_000 });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<{ brand: string; variants: string[]; grosirs: string[] }>('/settings') });
export const selectCls = 'h-9 max-sm:min-w-[46%] max-sm:flex-1 rounded-[10px] border border-line-strong bg-white/70 px-2.5 pr-7 text-sm font-medium text-ink backdrop-blur-sm transition-colors hover:bg-white focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:opacity-50';

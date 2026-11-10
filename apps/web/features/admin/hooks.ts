'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { KabRow } from '@/lib/types';

export const useWilayah = (inactive = false) => useQuery({ queryKey: ['wilayah', inactive], queryFn: () => api<KabRow[]>('/wilayah', { query: { include_inactive: inactive || undefined } }), staleTime: 300_000 });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<{ brand: string; variants: string[]; grosirs: string[] }>('/settings') });
export const selectCls = 'h-9 rounded-md border-2 border-ink bg-paper-card px-2 text-sm font-medium focus:border-tt focus:outline-none';

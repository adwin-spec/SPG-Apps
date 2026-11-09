'use client';
import { useQuery } from '@tanstack/react-query';
import { api, apiPage, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.code === 'MAKER_CHECKER' ? `${e.message} (maker–checker: the person who created or requested a record cannot approve it)` : e.message : e instanceof Error ? e.message : 'Request failed');

/** Data nature is always shown distinctly – estimates and observations are never presented as sales. */
export function NatureBadge({ nature }: { nature: string }) {
  const tone = nature === 'ACTUAL' ? 'good' : nature === 'ESTIMATE' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{nature === 'ACTUAL' ? 'Actual' : nature === 'ESTIMATE' ? 'Estimate' : 'Observation'}</Badge>;
}
export function SourceBadge({ source }: { source: string }) {
  if (source === 'MANUAL') return <span className="text-xs text-ink-muted">Manual</span>;
  return <Badge tone={source === 'OCR' ? 'info' : 'neutral'}>{source === 'OFFLINE_SYNC' ? 'Offline sync' : source}</Badge>;
}

export function MiniSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[] }) {
  return <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-auto min-w-[8rem] text-xs">
    <option value="">{label}: all</option>
    {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o.replace(/_/g, ' ').toLowerCase()}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </Select>;
}

export function useSpgOptions(category?: string) {
  return useQuery({ queryKey: ['spg-opts', category], queryFn: () => apiPage<{ id: string; fullName: string; employeeCode: string }>('/spgs', { query: { pageSize: 200, category } }), staleTime: 300_000 });
}
export function useOutletOptions(channel: string, extra?: Record<string, unknown>, enabled = true) {
  return useQuery({ queryKey: ['outlet-opts', channel, extra], queryFn: () => apiPage<{ id: string; name: string; code: string }>('/outlets', { query: { pageSize: 200, channel, ...extra } }), staleTime: 120_000, enabled });
}
export function useVariants() {
  return useQuery({ queryKey: ['variant-opts'], queryFn: () => apiPage<{ id: string; sku: string; name: string; unit: string; listPrice: string | null }>('/product-variants', { query: { pageSize: 200, active: 'true' } }), staleTime: 600_000 });
}
export interface Lookups { brands: { id: string; name: string; owner: string }[]; competitorProducts: { id: string; name: string; variant: string | null; sku: string | null; unit: string | null; brand: { name: string } }[] }
export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: () => api<Lookups>('/lookups'), staleTime: 600_000 });
}
export const KV = ({ k, v }: { k: string; v: React.ReactNode }) => <div><dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{k}</dt><dd className="mt-0.5 text-sm text-ink">{v ?? '–'}</dd></div>;

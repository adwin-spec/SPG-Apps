'use client';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api, apiPage } from '@/lib/api';

export type OrgTree = { id: string; name: string; code: string; areas: { id: string; name: string; code: string; districts: { id: string; name: string; code: string; subdistricts: { id: string; name: string; code: string }[] }[] }[] }[];

export function useOrgTree() {
  return useQuery({ queryKey: ['org-tree'], queryFn: () => api<OrgTree>('/organization/tree'), staleTime: 600_000 });
}
export function useAreas() {
  const t = useOrgTree();
  return (t.data ?? []).flatMap((r) => r.areas.map((a) => ({ ...a, regionName: r.name })));
}
export function useDistricts(areaId?: string) {
  const areas = useAreas();
  return areas.filter((a) => !areaId || a.id === areaId).flatMap((a) => a.districts);
}
export function useSupervisors(areaId?: string) {
  return useQuery({ queryKey: ['supervisors', areaId ?? 'all'], queryFn: () => api<{ id: string; fullName: string; areaId: string; areaName: string; email: string; spgCount: number; status: string }[]>('/organization/supervisors', { query: { parentId: areaId } }), staleTime: 300_000 });
}
export function useSpgOptions(params: Record<string, unknown> = {}) {
  return useQuery({ queryKey: ['spg-options', params], queryFn: () => apiPage<{ id: string; fullName: string; employeeCode: string; category: { code: string } }>('/spgs', { query: { pageSize: 200, ...params } }), staleTime: 300_000 });
}

/** Renders an API error including validation details (field-level messages). */
export function ApiErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  const details = Array.isArray(e?.details) ? (e.details as { path?: string; message?: string }[]) : null;
  return <div role="alert" className="mb-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical-text">
    <div className="font-medium">{e?.code === 'VERSION_CONFLICT' ? 'This record was changed by someone else. Close the dialog, reload, and re-apply your change.' : e?.message ?? 'Request failed'}</div>
    {details && <ul className="mt-1 list-disc pl-5 text-xs">{details.map((d, i) => <li key={i}>{d.path ? <b>{d.path}: </b> : null}{d.message ?? JSON.stringify(d)}</li>)}</ul>}
  </div>;
}

/** Definition list for detail pages. */
export function Details({ items }: { items: [string, React.ReactNode][] }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
    {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-ink-muted">{k}</dt><dd className="truncate text-ink">{v ?? '–'}</dd></div>)}
  </dl>;
}

/** Turns empty strings from <select>/<input> into undefined/null before Zod parsing. */
export const emptyToNull = (v: unknown) => (v === '' ? null : v);
export const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);
export const numOrNull = (v: unknown) => (v === '' || v == null ? null : Number(v));

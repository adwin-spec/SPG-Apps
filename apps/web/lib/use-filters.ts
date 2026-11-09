'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { jakartaDate } from '@tanda/shared';

export const FILTER_KEYS = ['from', 'to', 'category', 'regionId', 'areaId', 'districtId', 'subdistrictId', 'supervisorId', 'spgId', 'outletId', 'productId', 'productVariantId', 'competitorId', 'brandId'] as const;
export type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** Dashboard filters live in the URL, so views are shareable and exports reuse exactly the same filter. */
export function useFilters(defaults?: Filters) {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const today = jakartaDate();
  const filters = useMemo<Filters>(() => {
    const f: Filters = { from: `${today.slice(0, 7)}-01`, to: today, ...defaults };
    for (const k of FILTER_KEYS) { const v = sp.get(k); if (v) f[k] = v; }
    return f;
  }, [sp, today, defaults]);
  const setFilters = useCallback((patch: Filters) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [sp, router, pathname]);
  return { filters, setFilters };
}

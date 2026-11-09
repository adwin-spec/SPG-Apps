'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { currentPeriod } from './common';

/** Period (YYYY-MM) stored in the URL as ?period= */
export function usePeriod() {
  const sp = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const period = sp.get('period') ?? currentPeriod();
  const setPeriod = (p: string) => { const q = new URLSearchParams(sp.toString()); if (p) q.set('period', p); else q.delete('period'); router.replace(`${pathname}?${q.toString()}`, { scroll: false }); };
  return { period, setPeriod };
}

export function PeriodInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="flex items-center gap-1 text-xs text-ink-secondary">Period
    <Input type="month" aria-label="Performance period" value={value} max={currentPeriod()} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-8 w-[9.5rem] text-xs" /></label>;
}

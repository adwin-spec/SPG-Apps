'use client';
import { useEffect, useState } from 'react';
import { go, useScreen } from '../nav';
import { MapPin, Search } from 'lucide-react';
import { useField, type OutletLite } from '../field-state';
import { Card, MButton, mInput } from '../kit';

export function OutletsScreen() {
  const { boot, state, startVisit } = useField(); const { params: sp } = useScreen();
  const [q, setQ] = useState(''); const [pick, setPick] = useState<OutletLite | null>(null); const [purpose, setPurpose] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const id = sp.get('start'); if (id && boot) setPick(boot.outlets.find((o) => o.id === id) ?? null); }, [sp, boot]);
  if (!boot) return null;
  const list = boot.outlets.filter((o) => `${o.name} ${o.code} ${o.address ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const label = boot.spg.category === 'GROSIR' ? 'Wholesalers (grosir)' : boot.spg.category === 'HORECA' ? 'HORECA outlets' : 'Retail outlets';
  if (pick) return <Card className="space-y-3">
    <h1 className="text-base font-semibold">Start visit</h1>
    <div><div className="font-medium">{pick.name}</div><div className="text-xs text-ink-muted">{pick.code} · {pick.address ?? pick.district?.name}</div></div>
    {state.visit ? <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn-text">Finish your visit at {state.visit.outletName} first.</p>
      : !state.attendance ? <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn-text">Check in your attendance first (Today tab).</p>
      : <><label className="block text-xs font-medium text-ink-secondary">Purpose (optional)<input className={mInput} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
        <MButton disabled={busy} onClick={async () => { setBusy(true); await startVisit(pick, purpose); go('visit'); }}><MapPin className="h-5 w-5" />Check in at outlet</MButton></>}
    <MButton variant="secondary" onClick={() => setPick(null)}>Back</MButton>
  </Card>;
  return <div className="space-y-3">
    <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-ink-muted" /><input aria-label="Search outlets" className={`${mInput} pl-9`} placeholder="Search name, code, address" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <Card className="p-0"><h1 className="border-b border-border px-4 py-3 text-sm font-semibold">{label} · {list.length}</h1>
      <ul className="divide-y divide-border">{list.map((o) => <li key={o.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface" onClick={() => setPick(o)}>
        <MapPin className="h-5 w-5 shrink-0 text-ink-muted" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{o.name}</div><div className="truncate text-xs text-ink-muted">{o.code} · {o.subdistrict?.name ?? o.district?.name}</div></div>
        {state.visitedToday.includes(o.id) && <span className="text-2xs font-semibold text-good-text">Visited</span>}</button></li>)}</ul></Card>
  </div>;
}

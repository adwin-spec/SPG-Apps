'use client';
import { ScreenLink, go } from '../nav';
import { useState } from 'react';
import { CheckCircle2, Clock, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import { useField } from '../field-state';
import { Card, MButton, PhotoInput } from '../kit';
import { fmtDateTime } from '@/lib/format';

export function TodayScreen() {
  const { boot, state, loading, stale, savedAt, checkIn, checkOut } = useField();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (loading) return <p className="p-6 text-center text-sm text-ink-muted">Loading today…</p>;
  if (!boot) return <Card><p className="text-sm">No data cached yet. Connect to the internet once to download your outlets and products.</p></Card>;
  const att = state.attendance;
  const plans = boot.plans;
  const byId = new Map(boot.outlets.map((o) => [o.id, o]));
  return <div className="space-y-3">
    {stale && <div className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-text">Offline – showing data saved {savedAt ? fmtDateTime(new Date(savedAt).toISOString()) : ''}. Your entries are stored on this phone and sync automatically.</div>}
    <Card>
      <div className="mb-3 flex items-center justify-between"><h1 className="text-base font-semibold">Attendance</h1><span className="text-xs text-ink-muted">{boot.businessDate}</span></div>
      {!att ? <div className="space-y-3">
        <p className="flex items-start gap-2 text-xs text-ink-secondary"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Your location is captured once at check-in, check-out and outlet visits only – never tracked in the background.</p>
        <PhotoInput value={photo} onChange={setPhoto} label="Selfie / start-of-day photo (optional)" />
        <MButton disabled={busy} onClick={() => run(() => checkIn(photo))}><Navigation className="h-5 w-5" />Check in</MButton>
      </div> : <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-5 w-5 text-good-text" />Checked in {fmtDateTime(att.checkInAt)}</div>
        {att.checkOutAt ? <div className="flex items-center gap-2 text-sm"><Clock className="h-5 w-5 text-ink-muted" />Checked out {fmtDateTime(att.checkOutAt)}</div>
          : <MButton variant="secondary" disabled={busy || !!state.visit} onClick={() => run(checkOut)}>{state.visit ? 'Finish your visit before checking out' : 'Check out'}</MButton>}
      </div>}
    </Card>
    {state.visit && <ScreenLink to="visit" className="block rounded-xl bg-primary p-4 text-white"><div className="text-xs opacity-80">Visit in progress since {fmtDateTime(state.visit.checkInAt)}</div><div className="text-base font-semibold">{state.visit.outletName} →</div></ScreenLink>}
    <Card>
      <h2 className="mb-2 text-base font-semibold">Today&apos;s plan</h2>
      {!plans.length ? <p className="text-sm text-ink-muted">No planned visits today. Pick any assigned outlet from <ScreenLink className="text-primary" to="outlets">Outlets</ScreenLink>.</p>
        : <ul className="divide-y divide-border">{plans.map((p) => { const o = byId.get(p.outletId); const done = p.status === 'VISITED' || state.visitedToday.includes(p.outletId);
          return <li key={p.id} className="flex items-center gap-3 py-2.5">
            {done ? <CheckCircle2 className="h-5 w-5 text-good-text" aria-label="Visited" /> : <MapPin className="h-5 w-5 text-ink-muted" aria-label="Not visited" />}
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{o?.name ?? 'Outlet'}</div><div className="truncate text-xs text-ink-muted">{o?.address ?? o?.district?.name}</div></div>
            {!done && o && <button onClick={() => go('outlets', { start: o.id })} className="rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">Visit</button>}
          </li>; })}</ul>}
    </Card>
    <div className="grid grid-cols-2 gap-2">
      <ScreenLink to="reports" className="rounded-xl border border-border bg-white p-3 text-sm font-medium">Daily report →</ScreenLink>
      <ScreenLink to="sync" className="rounded-xl border border-border bg-white p-3 text-sm font-medium">Sync center →</ScreenLink>
    </div>
  </div>;
}

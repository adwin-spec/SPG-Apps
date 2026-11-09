'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { jakartaDate } from '@tanda/shared';
import { api } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/offline/db';
import { clientRef, enqueue, newId } from '@/lib/offline/outbox';
import { useOnline } from '@/lib/offline/use-outbox';

export interface OutletLite { id: string; code: string; name: string; channel: string; address?: string | null; latitude?: string | null; longitude?: string | null; status: string; picName?: string | null;
  district?: { name: string }; subdistrict?: { name: string } | null; retailerLinks?: { wholesalerOutletId: string; relationType: string }[] }
export interface Bootstrap {
  serverTime: string; businessDate: string;
  spg: { id: string; fullName: string; employeeCode: string; category: 'GROSIR' | 'HORECA' | 'REGULER'; area: { id: string; name: string } };
  outlets: OutletLite[]; retailers: OutletLite[];
  variants: { id: string; sku: string; name: string; unit: string; listPrice: string | null; product: { name: string; brand: { name: string } } }[];
  competitorProducts: { id: string; name: string; variant: string | null; sku: string | null; unit: string | null; brandId: string; brand: { name: string } }[];
  competitorBrands: { id: string; name: string }[];
  programs: { id: string; code: string; name: string; programType: string }[];
  plans: { id: string; outletId: string; status: string }[];
  attendance: { id: string; clientId: string; status: string; checkInAt: string | null; checkOutAt: string | null; workDate: string } | null;
  openVisit: { id: string; clientId: string; outletId: string; checkInAt: string; outlet: { id: string; name: string; channel: string } } | null;
}
export interface LocalVisit { ref: string; outletId: string; outletName: string; channel: string; checkInAt: string; geofence?: string | null }
export interface LocalState { date: string; attendance: { ref: string; checkInAt: string; checkOutAt?: string | null } | null; visit: LocalVisit | null; visitedToday: string[] }

interface Ctx {
  boot: Bootstrap | null; loading: boolean; stale: boolean; savedAt: number | null; state: LocalState; refresh: () => Promise<void>;
  checkIn: (photoKey?: string | null, note?: string) => Promise<void>; checkOut: () => Promise<void>;
  startVisit: (o: OutletLite, purpose?: string) => Promise<void>; endVisit: (data: Record<string, unknown>) => Promise<void>;
}
const FieldCtx = createContext<Ctx | null>(null);
const empty = (): LocalState => ({ date: jakartaDate(), attendance: null, visit: null, visitedToday: [] });

/** GPS is requested only at work events (check-in/out, visit) – never tracked in the background (risk R7). */
export function getGps(): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  });
}

export function FieldProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LocalState>(empty());

  const persist = useCallback(async (s: LocalState) => { setState(s); await cacheSet('fieldState', s); }, []);

  const refresh = useCallback(async () => {
    const local = (await cacheGet<LocalState>('fieldState'))?.value;
    const base = local && local.date === jakartaDate() ? local : empty();
    try {
      const b = await api<Bootstrap>('/field/bootstrap');
      await cacheSet('bootstrap', b);
      setBoot(b); setSavedAt(Date.now()); setStale(false);
      // Server truth wins when it knows more than the device (e.g. another device or a supervisor override).
      const next: LocalState = { ...base };
      if (b.attendance && !base.attendance) next.attendance = { ref: b.attendance.id, checkInAt: b.attendance.checkInAt ?? '', checkOutAt: b.attendance.checkOutAt };
      if (b.attendance?.checkOutAt && base.attendance && !base.attendance.checkOutAt) next.attendance = { ...base.attendance, checkOutAt: b.attendance.checkOutAt };
      if (b.openVisit && !base.visit) next.visit = { ref: b.openVisit.id, outletId: b.openVisit.outletId, outletName: b.openVisit.outlet.name, channel: b.openVisit.outlet.channel, checkInAt: b.openVisit.checkInAt };
      await persist(next);
    } catch {
      const cached = await cacheGet<Bootstrap>('bootstrap');
      if (cached) { setBoot(cached.value); setSavedAt(cached.savedAt); setStale(true); }
      setState(base);
    } finally { setLoading(false); }
  }, [persist]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (online) void refresh(); }, [online, refresh]);

  const checkIn = useCallback(async (photoKey?: string | null, note?: string) => {
    const gps = await getGps(); const clientId = newId(); const at = new Date().toISOString();
    await enqueue({ id: clientId, label: 'Attendance check-in', kind: 'json', method: 'POST', path: '/attendance/check-in', mapAs: clientId,
      body: { clientId, clientRecordedAt: at, gps, photoFileId: photoKey ? `file:${photoKey}` : null, note: note || null } });
    await persist({ ...state, attendance: { ref: clientRef(clientId), checkInAt: at } });
  }, [state, persist]);

  const checkOut = useCallback(async () => {
    const gps = await getGps(); const at = new Date().toISOString();
    await enqueue({ label: 'Attendance check-out', kind: 'json', method: 'POST', path: '/attendance/check-out', body: { clientRecordedAt: at, gps } });
    if (state.attendance) await persist({ ...state, attendance: { ...state.attendance, checkOutAt: at } });
  }, [state, persist]);

  const startVisit = useCallback(async (o: OutletLite, purpose?: string) => {
    const gps = await getGps(); const clientId = newId(); const at = new Date().toISOString();
    const plan = boot?.plans.find((p) => p.outletId === o.id && p.status === 'PLANNED');
    await enqueue({ id: clientId, label: `Check-in ${o.name}`, kind: 'json', method: 'POST', path: '/visits/check-in', mapAs: clientId,
      body: { clientId, clientRecordedAt: at, outletId: o.id, visitPlanId: plan?.id ?? null, gps, purpose: purpose || null } });
    await persist({ ...state, visit: { ref: clientRef(clientId), outletId: o.id, outletName: o.name, channel: o.channel, checkInAt: at } });
  }, [boot, state, persist]);

  const endVisit = useCallback(async (data: Record<string, unknown>) => {
    if (!state.visit) return;
    const gps = await getGps(); const at = new Date().toISOString();
    await enqueue({ label: `Check-out ${state.visit.outletName}`, kind: 'json', method: 'POST', path: `/visits/${state.visit.ref}/check-out`, body: { clientRecordedAt: at, gps, ...data } });
    await persist({ ...state, visit: null, visitedToday: [...new Set([...state.visitedToday, state.visit.outletId])] });
  }, [state, persist]);

  return <FieldCtx.Provider value={{ boot, loading, stale, savedAt, state, refresh, checkIn, checkOut, startVisit, endVisit }}>{children}</FieldCtx.Provider>;
}

export function useField() {
  const c = useContext(FieldCtx);
  if (!c) throw new Error('useField outside FieldProvider');
  return c;
}

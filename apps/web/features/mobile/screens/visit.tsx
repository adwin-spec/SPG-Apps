'use client';
import { ScreenLink, go } from '../nav';
import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { enqueue } from '@/lib/offline/outbox';
import { fmtDateTime } from '@/lib/format';
import { useField } from '../field-state';
import { Card, MButton, MField, PhotoInput, mInput } from '../kit';
import * as F from '../forms';

type Tab = { key: string; label: string; render: (saved: (l: string) => void) => React.ReactNode };

export function VisitScreen() {
  const { boot, state, endVisit } = useField();
  const [saved, setSaved] = useState<string[]>([]);
  const [tab, setTab] = useState<string>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [co, setCo] = useState({ outcome: '', notes: '', picMet: '', followUpAction: '', orderStatus: 'NO_ORDER' });
  const [busy, setBusy] = useState(false);
  const onSaved = (l: string) => setSaved((s) => [...s, `${l} · ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`]);
  const tabs: Tab[] = useMemo(() => {
    if (!boot || !state.visit) return [];
    const observedAt = boot.spg.category === 'GROSIR'
      ? [boot.outlets.find((o) => o.id === state.visit!.outletId)!, ...boot.retailers.filter((r) => r.retailerLinks?.some((l) => l.wholesalerOutletId === state.visit!.outletId))].filter(Boolean)
      : [boot.outlets.find((o) => o.id === state.visit!.outletId)!].filter(Boolean);
    const competitor: Tab = { key: 'competitor', label: 'Competitor', render: (s) => <F.CompetitorForm onSaved={s} observedAt={observedAt} /> };
    if (boot.spg.category === 'GROSIR') return [
      { key: 'tx', label: 'Retailer transaction', render: (s) => <F.RetailerTransactionForm onSaved={s} /> }, competitor,
      { key: 'stock', label: 'Grosir stock', render: (s) => <F.WholesaleStockForm onSaved={s} /> },
      { key: 'report', label: 'Visit report', render: (s) => <F.WholesaleReportForm onSaved={s} /> }];
    if (boot.spg.category === 'HORECA') return [
      { key: 'detail', label: 'Visit details', render: (s) => <F.HorecaDetailForm onSaved={s} /> }, { key: 'sale', label: 'Sale / order', render: (s) => <F.HorecaSaleForm onSaved={s} /> },
      { key: 'posm', label: 'POSM', render: (s) => <F.PosmForm onSaved={s} /> }, { key: 'program', label: 'Program', render: (s) => <F.ProgramForm onSaved={s} /> }, competitor];
    return [
      { key: 'availability', label: 'Availability', render: (s) => <F.AvailabilityForm onSaved={s} /> }, { key: 'visibility', label: 'Visibility', render: (s) => <F.VisibilityForm onSaved={s} /> },
      { key: 'order', label: 'Order', render: (s) => <F.OrderForm onSaved={s} /> }, { key: 'posm', label: 'POSM', render: (s) => <F.PosmForm onSaved={s} /> }, competitor];
  }, [boot, state.visit]);
  if (!state.visit) return <Card><p className="text-sm">No visit in progress.</p><ScreenLink to="outlets" className="mt-3 block text-sm font-medium text-primary">Choose an outlet →</ScreenLink></Card>;
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const addEvidence = async () => {
    if (!photo) return;
    await enqueue({ label: 'Visit evidence', kind: 'json', method: 'POST', path: `/visits/${state.visit!.ref}/evidence`, body: { fileId: `file:${photo}`, evidenceType: 'OUTLET_FRONT' } });
    onSaved('Evidence photo'); setPhoto(null);
  };
  return <div className="space-y-3">
    <Card className="bg-navy-900 text-white"><div className="text-xs text-slate-300">Visit since {fmtDateTime(state.visit.checkInAt)}</div><h1 className="text-lg font-semibold">{state.visit.outletName}</h1></Card>
    <div className="-mx-3 flex gap-1 overflow-x-auto px-3" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={active?.key === t.key} onClick={() => setTab(t.key)}
      className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium ${active?.key === t.key ? 'bg-primary text-white' : 'border border-border bg-white text-ink-secondary'}`}>{t.label}</button>)}</div>
    {active && <Card key={active.key}>{active.render(onSaved)}</Card>}
    {saved.length > 0 && <Card><h2 className="mb-1 text-sm font-semibold">Recorded this visit</h2><ul className="space-y-1 text-sm">{saved.map((s, i) => <li key={i} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-good-text" />{s}</li>)}</ul>
      <p className="mt-2 text-2xs text-ink-muted">Saved on this phone and synced automatically – see Sync center.</p></Card>}
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Outlet photo</h2>
      <PhotoInput value={photo} onChange={setPhoto} />
      {photo && <MButton variant="secondary" onClick={addEvidence}>Attach to visit</MButton>}
    </Card>
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Finish visit</h2>
      <MField label="Outcome"><input className={mInput} value={co.outcome} onChange={(e) => setCo({ ...co, outcome: e.target.value })} /></MField>
      <MField label="PIC met"><input className={mInput} value={co.picMet} onChange={(e) => setCo({ ...co, picMet: e.target.value })} /></MField>
      <MField label="Order status"><select className={mInput} value={co.orderStatus} onChange={(e) => setCo({ ...co, orderStatus: e.target.value })}>{['NO_ORDER', 'ORDERED', 'CONFIRMED'].map((s) => <option key={s}>{s}</option>)}</select></MField>
      <MField label="Follow-up action"><input className={mInput} value={co.followUpAction} onChange={(e) => setCo({ ...co, followUpAction: e.target.value })} /></MField>
      <MField label="Notes"><textarea className={`${mInput} h-20 py-2`} value={co.notes} onChange={(e) => setCo({ ...co, notes: e.target.value })} /></MField>
      <MButton variant="success" disabled={busy} onClick={async () => { setBusy(true); await endVisit({ outcome: co.outcome || null, notes: co.notes || null, picMet: co.picMet || null, followUpAction: co.followUpAction || null, orderStatus: co.orderStatus }); go('today'); }}>Check out of outlet</MButton>
    </Card>
  </div>;
}

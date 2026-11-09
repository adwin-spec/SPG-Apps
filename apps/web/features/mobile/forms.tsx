'use client';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  availabilityBatchSchema, competitorObservationSchema, horecaSaleSchema, horecaVisitDetailSchema, jakartaDate, outletOrderSchema, posmRecordSchema,
  programImplementationSchema, retailerTransactionSchema, shareOfShelf, visibilityRecordSchema, wholesaleObservationSchema, wholesaleReportSchema,
} from '@tanda/shared';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { enqueue, newId } from '@/lib/offline/outbox';
import { useOnline } from '@/lib/offline/use-outbox';
import { fmtIdr } from '@/lib/format';
import { useField, type OutletLite } from './field-state';
import { Card, MButton, MField, PhotoInput, SearchSelect, mInput, validatePayload } from './kit';

type Saved = (label: string) => void;
const today = () => jakartaDate();
const fileOrNull = (k: string | null) => (k ? `file:${k}` : null);
const numOrNull = (v: string) => (v === '' ? null : Number(v));

function useSubmit(onSaved: Saved) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async <T extends z.ZodType>(schema: T, label: string, path: string, body: Record<string, unknown>, mapAs?: string) => {
    const v = validatePayload(schema, body);
    if (!v.ok) { setErrors(v.errors); return false; }
    setErrors({}); setBusy(true);
    try { await enqueue({ id: (body.clientId as string) ?? newId(), label, kind: 'json', method: 'POST', path, body, mapAs }); onSaved(label); return true; } finally { setBusy(false); }
  };
  return { errors, busy, submit, setErrors };
}

// ───────────────────────── SPG Grosir ─────────────────────────
type Line = { owner: 'COMPANY' | 'COMPETITOR'; productVariantId: string; competitorProductId: string; brandText: string; quantity: string; unit: string; unitPrice: string };
const emptyLine = (): Line => ({ owner: 'COMPANY', productVariantId: '', competitorProductId: '', brandText: '', quantity: '', unit: '', unitPrice: '' });

export function RetailerTransactionForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state, refresh } = useField(); const online = useOnline();
  const { errors, busy, submit } = useSubmit(onSaved);
  const [retailerId, setRetailerId] = useState(''); const [nature, setNature] = useState<'ACTUAL' | 'ESTIMATE' | 'OBSERVATION'>('ACTUAL');
  const [lines, setLines] = useState<Line[]>([emptyLine()]); const [photo, setPhoto] = useState<string | null>(null); const [notes, setNotes] = useState('');
  const [newRetailer, setNewRetailer] = useState(false);
  const ws = state.visit!.outletId;
  const retailers = useMemo(() => [...(boot?.retailers ?? [])].sort((a, b) => Number(!!b.retailerLinks?.some((l) => l.wholesalerOutletId === ws)) - Number(!!a.retailerLinks?.some((l) => l.wholesalerOutletId === ws))), [boot, ws]);
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  if (newRetailer) return <NewRetailerForm wholesalerId={ws} onDone={async (id) => { setNewRetailer(false); await refresh(); if (id) setRetailerId(id); }} online={online} />;
  const save = async () => {
    const clientId = newId();
    const ok = await submit(retailerTransactionSchema, 'Retailer transaction', '/retailer-transactions', {
      clientId, clientRecordedAt: new Date().toISOString(), retailerOutletId: retailerId, wholesalerOutletId: ws, visitId: state.visit!.ref, transactionDate: today(), dataNature: nature,
      evidenceFileId: fileOrNull(photo), notes: notes || null,
      items: lines.map((l) => ({ productOwner: l.owner, productVariantId: l.owner === 'COMPANY' ? l.productVariantId || null : null, competitorProductId: l.owner === 'COMPETITOR' ? l.competitorProductId || null : null,
        brandText: l.owner === 'COMPETITOR' && !l.competitorProductId ? l.brandText || null : null, quantity: Number(l.quantity), unit: l.unit, unitPrice: numOrNull(l.unitPrice) })),
    });
    if (ok) { setLines([emptyLine()]); setRetailerId(''); setPhoto(null); setNotes(''); }
  };
  return <div className="space-y-3">
    <SearchSelect label="Retailer" items={retailers} value={retailerId} onChange={setRetailerId} error={errors.retailerOutletId}
      render={(r) => `${r.name} · ${r.code}${r.retailerLinks?.some((l) => l.wholesalerOutletId === ws) ? '' : ' (other grosir)'}`} />
    <button type="button" className="text-sm font-medium text-primary" onClick={() => setNewRetailer(true)}>+ Register a new retailer</button>
    <MField label="Data nature" hint="Only ACTUAL (evidence-backed) counts as sales; estimates and observations are kept separate.">
      <select className={mInput} value={nature} onChange={(e) => setNature(e.target.value as typeof nature)}><option value="ACTUAL">Actual transaction</option><option value="ESTIMATE">Estimate</option><option value="OBSERVATION">Observation</option></select></MField>
    {lines.map((l, i) => <div key={i} className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between"><div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
        {(['COMPANY', 'COMPETITOR'] as const).map((o) => <button key={o} type="button" onClick={() => set(i, { owner: o, productVariantId: '', competitorProductId: '', unit: '' })} className={`rounded-md px-3 py-1.5 ${l.owner === o ? 'bg-navy-900 text-white' : ''}`}>{o === 'COMPANY' ? 'Our product' : 'Competitor'}</button>)}</div>
        {lines.length > 1 && <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-ink-muted" /></button>}</div>
      {l.owner === 'COMPANY'
        ? <select aria-label="SKU" className={mInput} value={l.productVariantId} onChange={(e) => { const v = boot!.variants.find((x) => x.id === e.target.value); set(i, { productVariantId: e.target.value, unit: v?.unit ?? '', unitPrice: v?.listPrice ? String(Number(v.listPrice)) : l.unitPrice }); }}>
            <option value="">Select SKU…</option>{boot!.variants.map((v) => <option key={v.id} value={v.id}>{v.sku} – {v.name}</option>)}</select>
        : <><select aria-label="Competitor product" className={mInput} value={l.competitorProductId} onChange={(e) => { const c = boot!.competitorProducts.find((x) => x.id === e.target.value); set(i, { competitorProductId: e.target.value, unit: c?.unit ?? l.unit }); }}>
            <option value="">Competitor product (or type brand below)…</option>{boot!.competitorProducts.map((c) => <option key={c.id} value={c.id}>{c.brand.name} – {c.name}{c.variant ? ` ${c.variant}` : ''}</option>)}</select>
          {!l.competitorProductId && <input aria-label="Competitor brand" className={mInput} placeholder="Brand name if not listed" value={l.brandText} onChange={(e) => set(i, { brandText: e.target.value })} />}</>}
      <div className="grid grid-cols-3 gap-2">
        <input aria-label="Quantity" inputMode="decimal" className={mInput} placeholder="Qty" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
        <input aria-label="Unit" className={mInput} placeholder="Unit" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
        <input aria-label="Unit price" inputMode="numeric" className={mInput} placeholder="Price" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} />
      </div>
      {Object.entries(errors).filter(([k]) => k.startsWith(`items.${i}.`)).map(([k, m]) => <p key={k} className="text-xs text-critical-text">{m}</p>)}
    </div>)}
    <button type="button" className="flex items-center gap-1 text-sm font-medium text-primary" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-4 w-4" />Add line</button>
    <div className="text-right text-sm">Total <span className="num font-semibold">{fmtIdr(total)}</span></div>
    <PhotoInput value={photo} onChange={setPhoto} label="Nota / evidence photo" />
    <MField label="Notes"><input className={mInput} value={notes} onChange={(e) => setNotes(e.target.value)} /></MField>
    {errors.items && <p className="text-xs text-critical-text">{errors.items}</p>}
    <MButton disabled={busy} onClick={save}>Save transaction</MButton>
  </div>;
}

function NewRetailerForm({ wholesalerId, onDone, online }: { wholesalerId: string; onDone: (id?: string) => void; online: boolean }) {
  const { boot } = useField();
  const [name, setName] = useState(''); const [address, setAddress] = useState(''); const [dupes, setDupes] = useState<{ code: string; name: string; district: string; similarity: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const ws = boot?.outlets.find((o) => o.id === wholesalerId);
  const create = async (confirm: boolean) => {
    setBusy(true); setError(null);
    try {
      const w = await api<{ districtId: string; subdistrictId: string | null }>(`/outlets/${wholesalerId}`);
      const r = await api<{ id: string }>('/outlets', { method: 'POST', body: { name, address: address || null, channel: 'RETAILER', districtId: w.districtId, subdistrictId: w.subdistrictId, primaryWholesalerId: wholesalerId, confirmNotDuplicate: confirm, status: 'PROSPECT' } });
      onDone(r.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'POSSIBLE_DUPLICATE') setDupes(e.details as never); else setError((e as Error).message);
    } finally { setBusy(false); }
  };
  if (!online) return <Card><p className="text-sm">Registering a new retailer needs a connection so we can check for duplicates. Record it later, or note the name in the transaction notes.</p><MButton variant="secondary" className="mt-3" onClick={() => onDone()}>Back</MButton></Card>;
  return <div className="space-y-3">
    <h3 className="font-semibold">New retailer of {ws?.name}</h3>
    <MField label="Retailer name"><input className={mInput} value={name} onChange={(e) => { setName(e.target.value); setDupes(null); }} /></MField>
    <MField label="Address"><input className={mInput} value={address} onChange={(e) => setAddress(e.target.value)} /></MField>
    {error && <p className="text-sm text-critical-text">{error}</p>}
    {dupes ? <div className="rounded-lg bg-warn-soft p-3 text-sm"><p className="font-medium text-warn-text">Similar retailers already exist – pick one instead of creating a duplicate:</p>
      <ul className="mt-2 space-y-1">{dupes.map((d) => <li key={d.code}>{d.name} ({d.code}, {d.district}) · {(d.similarity * 100).toFixed(0)}% similar</li>)}</ul>
      <MButton variant="secondary" className="mt-3" disabled={busy} onClick={() => create(true)}>It is a different retailer – create anyway</MButton></div>
      : <MButton disabled={busy || name.trim().length < 3} onClick={() => create(false)}>Register retailer</MButton>}
    <MButton variant="secondary" onClick={() => onDone()}>Cancel</MButton>
  </div>;
}

export function WholesaleStockForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ productVariantId: '', stockQuantity: '', stockAvailability: 'IN_STOCK', buyPrice: '', sellPrice: '', restockFrequency: '', lastRestockDate: '' });
  const save = async () => { const ok = await submit(wholesaleObservationSchema, 'Wholesale stock check', '/wholesale/observations', { clientId: newId(), wholesalerOutletId: state.visit!.outletId, visitId: state.visit!.ref, productVariantId: f.productVariantId,
    observationDate: today(), stockQuantity: numOrNull(f.stockQuantity), stockAvailability: f.stockAvailability, buyPrice: numOrNull(f.buyPrice), sellPrice: numOrNull(f.sellPrice), restockFrequency: f.restockFrequency || null, lastRestockDate: f.lastRestockDate || null });
    if (ok) setF({ ...f, productVariantId: '', stockQuantity: '', buyPrice: '', sellPrice: '' }); };
  return <div className="space-y-3">
    <MField label="SKU" error={errors.productVariantId}><select className={mInput} value={f.productVariantId} onChange={(e) => setF({ ...f, productVariantId: e.target.value })}><option value="">Select…</option>{boot!.variants.map((v) => <option key={v.id} value={v.id}>{v.sku} – {v.name}</option>)}</select></MField>
    <div className="grid grid-cols-2 gap-2"><MField label="Stock qty"><input inputMode="decimal" className={mInput} value={f.stockQuantity} onChange={(e) => setF({ ...f, stockQuantity: e.target.value })} /></MField>
      <MField label="Availability"><select className={mInput} value={f.stockAvailability} onChange={(e) => setF({ ...f, stockAvailability: e.target.value })}>{['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN'].map((s) => <option key={s}>{s}</option>)}</select></MField>
      <MField label="Buy price"><input inputMode="numeric" className={mInput} value={f.buyPrice} onChange={(e) => setF({ ...f, buyPrice: e.target.value })} /></MField>
      <MField label="Sell price"><input inputMode="numeric" className={mInput} value={f.sellPrice} onChange={(e) => setF({ ...f, sellPrice: e.target.value })} /></MField>
      <MField label="Restock frequency"><input className={mInput} placeholder="e.g. weekly" value={f.restockFrequency} onChange={(e) => setF({ ...f, restockFrequency: e.target.value })} /></MField>
      <MField label="Last restock"><input type="date" className={mInput} value={f.lastRestockDate} onChange={(e) => setF({ ...f, lastRestockDate: e.target.value })} /></MField></div>
    <MButton disabled={busy} onClick={save}>Save stock check</MButton>
  </div>;
}

export function WholesaleReportForm({ onSaved }: { onSaved: Saved }) {
  const { state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ reportedRetailerCount: '', stockNotes: '', marketNotes: '' });
  return <div className="space-y-3">
    <MField label="Retailers served (reported by grosir)" error={errors.reportedRetailerCount}><input inputMode="numeric" className={mInput} value={f.reportedRetailerCount} onChange={(e) => setF({ ...f, reportedRetailerCount: e.target.value })} /></MField>
    <MField label="Stock notes"><textarea className={`${mInput} h-20 py-2`} value={f.stockNotes} onChange={(e) => setF({ ...f, stockNotes: e.target.value })} /></MField>
    <MField label="Market notes (prices, demand, competitor moves)"><textarea className={`${mInput} h-20 py-2`} value={f.marketNotes} onChange={(e) => setF({ ...f, marketNotes: e.target.value })} /></MField>
    <MButton disabled={busy} onClick={() => submit(wholesaleReportSchema, 'Wholesale visit report', '/wholesale/reports', { visitId: state.visit!.ref, reportedRetailerCount: numOrNull(f.reportedRetailerCount), stockNotes: f.stockNotes || null, marketNotes: f.marketNotes || null })}>Save visit report</MButton>
  </div>;
}

// ───────────────────────── Competitor (all categories) ─────────────────────────
export function CompetitorForm({ onSaved, observedAt }: { onSaved: Saved; observedAt: OutletLite[] }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ outletId: state.visit!.outletId, competitorProductId: '', brandId: '', brandText: '', purchasePrice: '', sellingPrice: '', quantityPurchased: '', stockAvailability: 'IN_STOCK', purchaseFrequency: '', facing: '', hasPosm: false, hasPromotion: false, promotionDetail: '', activityDetail: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const save = async () => {
    const ok = await submit(competitorObservationSchema, 'Competitor observation', '/competitor-observations', {
      clientId: newId(), clientRecordedAt: new Date().toISOString(), outletId: f.outletId, wholesalerOutletId: state.visit!.channel === 'WHOLESALER' ? state.visit!.outletId : null,
      visitId: f.outletId === state.visit!.outletId ? state.visit!.ref : null, competitorProductId: f.competitorProductId || null, brandId: f.competitorProductId ? null : f.brandId || null,
      brandText: !f.competitorProductId && !f.brandId ? f.brandText || null : null, observationDate: today(), purchasePrice: numOrNull(f.purchasePrice), sellingPrice: numOrNull(f.sellingPrice),
      quantityPurchased: numOrNull(f.quantityPurchased), stockAvailability: f.stockAvailability, purchaseFrequency: f.purchaseFrequency || null, facing: numOrNull(f.facing),
      hasPosm: f.hasPosm, hasPromotion: f.hasPromotion, promotionDetail: f.hasPromotion ? f.promotionDetail || null : null, activityDetail: f.activityDetail || null, photoFileId: fileOrNull(photo) });
    if (ok) { setF({ ...f, competitorProductId: '', brandId: '', brandText: '', purchasePrice: '', sellingPrice: '', quantityPurchased: '', facing: '', promotionDetail: '', activityDetail: '' }); setPhoto(null); }
  };
  return <div className="space-y-3">
    {observedAt.length > 1 && <SearchSelect label="Observed at" items={observedAt} value={f.outletId} onChange={(id) => setF({ ...f, outletId: id })} render={(o) => `${o.name} · ${o.channel === 'WHOLESALER' ? 'grosir' : 'retailer'}`} />}
    <MField label="Competitor product"><select className={mInput} value={f.competitorProductId} onChange={(e) => setF({ ...f, competitorProductId: e.target.value })}><option value="">Not listed – choose brand below</option>
      {boot!.competitorProducts.map((c) => <option key={c.id} value={c.id}>{c.brand.name} – {c.name}{c.variant ? ` ${c.variant}` : ''}</option>)}</select></MField>
    {!f.competitorProductId && <div className="grid grid-cols-2 gap-2">
      <MField label="Brand"><select className={mInput} value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })}><option value="">Other…</option>{boot!.competitorBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></MField>
      {!f.brandId && <MField label="Brand name" error={errors.brandText}><input className={mInput} value={f.brandText} onChange={(e) => setF({ ...f, brandText: e.target.value })} /></MField>}</div>}
    <div className="grid grid-cols-2 gap-2">
      <MField label="Purchase price"><input inputMode="numeric" className={mInput} value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: e.target.value })} /></MField>
      <MField label="Selling price"><input inputMode="numeric" className={mInput} value={f.sellingPrice} onChange={(e) => setF({ ...f, sellingPrice: e.target.value })} /></MField>
      <MField label="Qty purchased"><input inputMode="decimal" className={mInput} value={f.quantityPurchased} onChange={(e) => setF({ ...f, quantityPurchased: e.target.value })} /></MField>
      <MField label="Stock"><select className={mInput} value={f.stockAvailability} onChange={(e) => setF({ ...f, stockAvailability: e.target.value })}>{['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN'].map((s) => <option key={s}>{s}</option>)}</select></MField>
      <MField label="Purchase frequency"><input className={mInput} placeholder="e.g. weekly" value={f.purchaseFrequency} onChange={(e) => setF({ ...f, purchaseFrequency: e.target.value })} /></MField>
      <MField label="Facing"><input inputMode="numeric" className={mInput} value={f.facing} onChange={(e) => setF({ ...f, facing: e.target.value })} /></MField></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.hasPosm} onChange={(e) => setF({ ...f, hasPosm: e.target.checked })} />Competitor POSM present</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.hasPromotion} onChange={(e) => setF({ ...f, hasPromotion: e.target.checked })} />Promotion running</label>
    {f.hasPromotion && <MField label="Promotion detail"><input className={mInput} value={f.promotionDetail} onChange={(e) => setF({ ...f, promotionDetail: e.target.value })} /></MField>}
    <MField label="Other competitor activity"><input className={mInput} value={f.activityDetail} onChange={(e) => setF({ ...f, activityDetail: e.target.value })} /></MField>
    <PhotoInput value={photo} onChange={setPhoto} />
    <MButton disabled={busy} onClick={save}>Save observation</MButton>
  </div>;
}

// ───────────────────────── SPG HORECA ─────────────────────────
export function HorecaDetailForm({ onSaved }: { onSaved: Saved }) {
  const { state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ visitPurpose: 'SALES', picRole: '', result: '', nextFollowUpDate: '' });
  return <div className="space-y-3">
    <MField label="Visit purpose" error={errors.visitPurpose}><select className={mInput} value={f.visitPurpose} onChange={(e) => setF({ ...f, visitPurpose: e.target.value })}>{['SALES', 'FOLLOW_UP', 'PROGRAM', 'NEW_OUTLET', 'COMPLAINT', 'RELATIONSHIP', 'OTHER'].map((s) => <option key={s}>{s}</option>)}</select></MField>
    <MField label="PIC role (who you met)"><input className={mInput} value={f.picRole} onChange={(e) => setF({ ...f, picRole: e.target.value })} /></MField>
    <MField label="Result"><textarea className={`${mInput} h-20 py-2`} value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} /></MField>
    <MField label="Next follow-up"><input type="date" className={mInput} value={f.nextFollowUpDate} onChange={(e) => setF({ ...f, nextFollowUpDate: e.target.value })} /></MField>
    <MButton disabled={busy} onClick={() => submit(horecaVisitDetailSchema, 'HORECA visit details', '/horeca/visit-details', { visitId: state.visit!.ref, ...f, picRole: f.picRole || null, result: f.result || null, nextFollowUpDate: f.nextFollowUpDate || null })}>Save details</MButton>
  </div>;
}

export function HorecaSaleForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ productVariantId: '', quantity: '', unit: '', unitPrice: '', isOrder: true, stockQuantity: '', restockFrequency: '', dataNature: 'ACTUAL' });
  const save = async () => { const ok = await submit(horecaSaleSchema, 'HORECA sale/order', '/horeca/sales', { clientId: newId(), clientRecordedAt: new Date().toISOString(), outletId: state.visit!.outletId, visitId: state.visit!.ref, saleDate: today(),
    productVariantId: f.productVariantId, quantity: Number(f.quantity), unit: f.unit, unitPrice: numOrNull(f.unitPrice), isOrder: f.isOrder, stockQuantity: numOrNull(f.stockQuantity), restockFrequency: f.restockFrequency || null, dataNature: f.dataNature });
    if (ok) setF({ ...f, productVariantId: '', quantity: '', unitPrice: '', stockQuantity: '' }); };
  return <div className="space-y-3">
    <MField label="SKU" error={errors.productVariantId}><select className={mInput} value={f.productVariantId} onChange={(e) => { const v = boot!.variants.find((x) => x.id === e.target.value); setF({ ...f, productVariantId: e.target.value, unit: v?.unit ?? '', unitPrice: v?.listPrice ? String(Number(v.listPrice)) : '' }); }}>
      <option value="">Select…</option>{boot!.variants.map((v) => <option key={v.id} value={v.id}>{v.sku} – {v.name}</option>)}</select></MField>
    <div className="grid grid-cols-3 gap-2"><MField label="Qty" error={errors.quantity}><input inputMode="decimal" className={mInput} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></MField>
      <MField label="Unit"><input className={mInput} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></MField>
      <MField label="Price"><input inputMode="numeric" className={mInput} value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} /></MField></div>
    <div className="grid grid-cols-2 gap-2"><MField label="Outlet stock"><input inputMode="decimal" className={mInput} value={f.stockQuantity} onChange={(e) => setF({ ...f, stockQuantity: e.target.value })} /></MField>
      <MField label="Restock frequency"><input className={mInput} value={f.restockFrequency} onChange={(e) => setF({ ...f, restockFrequency: e.target.value })} /></MField></div>
    <MField label="Data nature"><select className={mInput} value={f.dataNature} onChange={(e) => setF({ ...f, dataNature: e.target.value })}><option value="ACTUAL">Actual order</option><option value="ESTIMATE">Estimate</option></select></MField>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.isOrder} onChange={(e) => setF({ ...f, isOrder: e.target.checked })} />This is a purchase order</label>
    <MButton disabled={busy} onClick={save}>Save sale</MButton>
  </div>;
}

export function ProgramForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ programId: '', status: 'EXECUTED', actualCost: '', realizationNote: '', effectivenessNote: '' }); const [photo, setPhoto] = useState<string | null>(null);
  if (!boot!.programs.length) return <p className="text-sm text-ink-muted">No active programs.</p>;
  return <div className="space-y-3">
    <MField label="Program" error={errors.programId}><select className={mInput} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}><option value="">Select…</option>{boot!.programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.programType})</option>)}</select></MField>
    <MField label="Status"><select className={mInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{['EXECUTED', 'PARTIAL', 'NOT_EXECUTED', 'PLANNED'].map((s) => <option key={s}>{s}</option>)}</select></MField>
    <MField label="Actual cost"><input inputMode="numeric" className={mInput} value={f.actualCost} onChange={(e) => setF({ ...f, actualCost: e.target.value })} /></MField>
    <MField label="Realisation"><textarea className={`${mInput} h-16 py-2`} value={f.realizationNote} onChange={(e) => setF({ ...f, realizationNote: e.target.value })} /></MField>
    <MField label="Effectiveness / outlet feedback"><textarea className={`${mInput} h-16 py-2`} value={f.effectivenessNote} onChange={(e) => setF({ ...f, effectivenessNote: e.target.value })} /></MField>
    <PhotoInput value={photo} onChange={setPhoto} label="Execution photo (required to validate EXECUTED)" />
    <MButton disabled={busy} onClick={async () => { if (await submit(programImplementationSchema, 'Program implementation', '/horeca/program-implementations', { clientId: newId(), programId: f.programId, outletId: state.visit!.outletId, visitId: state.visit!.ref, implementationDate: today(), status: f.status, actualCost: numOrNull(f.actualCost), realizationNote: f.realizationNote || null, effectivenessNote: f.effectivenessNote || null, photoFileId: fileOrNull(photo) })) setPhoto(null); }}>Save program execution</MButton>
  </div>;
}

export function PosmForm({ onSaved }: { onSaved: Saved }) {
  const { state } = useField(); const { busy, submit } = useSubmit(onSaved);
  const types = state.visit!.channel === 'HORECA' ? ['MENU_BRANDING', 'TABLE_TENT', 'CHILLER', 'BANNER', 'POSTER', 'OTHER'] : ['BANNER', 'POSTER', 'SHELF_TALKER', 'WOBBLER', 'DISPLAY_RACK', 'OTHER'];
  const [f, setF] = useState({ posmType: types[0], status: 'INSTALLED', quantity: '1', notes: '' }); const [photo, setPhoto] = useState<string | null>(null);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2"><MField label="POSM type"><select className={mInput} value={f.posmType} onChange={(e) => setF({ ...f, posmType: e.target.value })}>{types.map((t) => <option key={t}>{t}</option>)}</select></MField>
      <MField label="Status"><select className={mInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{['INSTALLED', 'MISSING', 'DAMAGED', 'NOT_APPLICABLE'].map((t) => <option key={t}>{t}</option>)}</select></MField>
      <MField label="Quantity"><input inputMode="numeric" className={mInput} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></MField>
      <MField label="Notes"><input className={mInput} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></MField></div>
    <PhotoInput value={photo} onChange={setPhoto} label="POSM photo (needed to validate INSTALLED)" />
    <MButton disabled={busy} onClick={async () => { if (await submit(posmRecordSchema, `POSM ${f.posmType}`, '/posm-records', { clientId: newId(), outletId: state.visit!.outletId, visitId: state.visit!.ref, recordDate: today(), posmType: f.posmType, status: f.status, quantity: numOrNull(f.quantity), notes: f.notes || null, photoFileId: fileOrNull(photo) })) setPhoto(null); }}>Save POSM</MButton>
  </div>;
}

// ───────────────────────── SPG Reguler ─────────────────────────
export function AvailabilityForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [rows, setRows] = useState(() => boot!.variants.map((v) => ({ productVariantId: v.id, label: `${v.sku} – ${v.name}`, checked: false, isAvailable: true, stockQuantity: '', oosReason: '' })));
  const set = (i: number, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const chosen = rows.filter((r) => r.checked);
  return <div className="space-y-2">
    <p className="text-xs text-ink-muted">Tick each SKU you checked on the shelf.</p>
    {rows.map((r, i) => <div key={r.productVariantId} className="rounded-lg border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-5 w-5" checked={r.checked} onChange={(e) => set(i, { checked: e.target.checked })} />{r.label}</label>
      {r.checked && <div className="mt-2 grid grid-cols-2 gap-2">
        <select aria-label="Availability" className={mInput} value={r.isAvailable ? 'Y' : 'N'} onChange={(e) => set(i, { isAvailable: e.target.value === 'Y' })}><option value="Y">Available</option><option value="N">Out of stock</option></select>
        {r.isAvailable ? <input aria-label="Stock qty" inputMode="decimal" className={mInput} placeholder="Stock qty" value={r.stockQuantity} onChange={(e) => set(i, { stockQuantity: e.target.value })} />
          : <select aria-label="OOS reason" className={mInput} value={r.oosReason} onChange={(e) => set(i, { oosReason: e.target.value })}><option value="">Reason…</option>{['Sold out', 'Distributor late', 'Not listed', 'No budget', 'Other'].map((x) => <option key={x}>{x}</option>)}</select>}
        {errors[`items.${chosen.indexOf(r)}.oosReason`] && <p className="col-span-2 text-xs text-critical-text">Out-of-stock needs a reason</p>}
      </div>}
    </div>)}
    <MButton disabled={busy || !chosen.length} onClick={async () => {
      const ok = await submit(availabilityBatchSchema, `Availability (${chosen.length} SKU)`, '/regular/availability', { outletId: state.visit!.outletId, visitId: state.visit!.ref, recordDate: today(),
        items: chosen.map((r) => ({ clientId: newId(), productVariantId: r.productVariantId, isAvailable: r.isAvailable, stockQuantity: r.isAvailable ? numOrNull(r.stockQuantity) : 0, oosReason: r.isAvailable ? null : r.oosReason || null })) });
      if (ok) setRows((rs) => rs.map((r) => ({ ...r, checked: false, stockQuantity: '', oosReason: '' })));
    }}>Save availability ({chosen.length})</MButton>
  </div>;
}

export function VisibilityForm({ onSaved }: { onSaved: Saved }) {
  const { state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [f, setF] = useState({ companyFacing: '', competitorFacing: '', totalCategoryFacing: '', hasDisplay: false, displayType: '', hasPromotion: false, promotionDetail: '', notes: '' }); const [photo, setPhoto] = useState<string | null>(null);
  const c = Number(f.companyFacing) || 0, k = Number(f.competitorFacing) || 0, t = Number(f.totalCategoryFacing) || 0;
  let sos: string; try { const v = shareOfShelf(c, t); sos = v == null ? 'n/a' : `${v}%`; } catch { sos = 'invalid'; }
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2"><MField label="Our facing"><input inputMode="numeric" className={mInput} value={f.companyFacing} onChange={(e) => setF({ ...f, companyFacing: e.target.value })} /></MField>
      <MField label="Competitor"><input inputMode="numeric" className={mInput} value={f.competitorFacing} onChange={(e) => setF({ ...f, competitorFacing: e.target.value })} /></MField>
      <MField label="Total category" error={errors.totalCategoryFacing}><input inputMode="numeric" className={mInput} value={f.totalCategoryFacing} onChange={(e) => setF({ ...f, totalCategoryFacing: e.target.value })} /></MField></div>
    <div className="rounded-lg bg-surface px-3 py-2 text-sm">Share of Shelf = {c} / {t || '–'} × 100 = <b>{sos}</b>{c + k > t && t > 0 && <span className="text-critical-text"> · company + competitor exceed total</span>}</div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.hasDisplay} onChange={(e) => setF({ ...f, hasDisplay: e.target.checked })} />Secondary display present</label>
    {f.hasDisplay && <MField label="Display type"><input className={mInput} value={f.displayType} onChange={(e) => setF({ ...f, displayType: e.target.value })} /></MField>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.hasPromotion} onChange={(e) => setF({ ...f, hasPromotion: e.target.checked })} />Our promotion active</label>
    {f.hasPromotion && <MField label="Promotion detail"><input className={mInput} value={f.promotionDetail} onChange={(e) => setF({ ...f, promotionDetail: e.target.value })} /></MField>}
    <PhotoInput value={photo} onChange={setPhoto} label="Shelf photo (needed to validate)" />
    <MButton disabled={busy} onClick={async () => { if (await submit(visibilityRecordSchema, 'Shelf visibility', '/regular/visibility', { clientId: newId(), outletId: state.visit!.outletId, visitId: state.visit!.ref, recordDate: today(), companyFacing: c, competitorFacing: k, totalCategoryFacing: t, hasDisplay: f.hasDisplay, displayType: f.displayType || null, hasPromotion: f.hasPromotion, promotionDetail: f.promotionDetail || null, notes: f.notes || null, photoFileId: fileOrNull(photo) })) setPhoto(null); }}>Save visibility</MButton>
  </div>;
}

export function OrderForm({ onSaved }: { onSaved: Saved }) {
  const { boot, state } = useField(); const { errors, busy, submit } = useSubmit(onSaved);
  const [lines, setLines] = useState([{ productVariantId: '', quantity: '', unit: '', unitPrice: '' }]); const [isRestock, setIsRestock] = useState(false);
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const set = (i: number, p: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return <div className="space-y-3">
    {lines.map((l, i) => <div key={i} className="space-y-2 rounded-lg border border-border p-3">
      <select aria-label="SKU" className={mInput} value={l.productVariantId} onChange={(e) => { const v = boot!.variants.find((x) => x.id === e.target.value); set(i, { productVariantId: e.target.value, unit: v?.unit ?? '', unitPrice: v?.listPrice ? String(Number(v.listPrice)) : '' }); }}>
        <option value="">Select SKU…</option>{boot!.variants.map((v) => <option key={v.id} value={v.id}>{v.sku} – {v.name}</option>)}</select>
      <div className="grid grid-cols-3 gap-2"><input aria-label="Quantity" inputMode="decimal" className={mInput} placeholder="Qty" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
        <input aria-label="Unit" className={mInput} placeholder="Unit" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
        <input aria-label="Unit price" inputMode="numeric" className={mInput} placeholder="Price" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></div>
      {lines.length > 1 && <button type="button" className="text-xs text-critical-text" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>}
    </div>)}
    <button type="button" className="flex items-center gap-1 text-sm font-medium text-primary" onClick={() => setLines((ls) => [...ls, { productVariantId: '', quantity: '', unit: '', unitPrice: '' }])}><Plus className="h-4 w-4" />Add SKU</button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={isRestock} onChange={(e) => setIsRestock(e.target.checked)} />Restock order</label>
    <div className="text-right text-sm">Total <span className="num font-semibold">{fmtIdr(total)}</span></div>
    {Object.keys(errors).length > 0 && <p className="text-xs text-critical-text">Complete SKU, quantity, unit and price on every line.</p>}
    <MButton disabled={busy} onClick={async () => { if (await submit(outletOrderSchema, 'Outlet order', '/regular/orders', { clientId: newId(), clientRecordedAt: new Date().toISOString(), outletId: state.visit!.outletId, visitId: state.visit!.ref, orderDate: today(), status: 'ORDERED', isRestock,
      items: lines.map((l) => ({ productVariantId: l.productVariantId, quantity: Number(l.quantity), unit: l.unit, unitPrice: Number(l.unitPrice) })) })) setLines([{ productVariantId: '', quantity: '', unit: '', unitPrice: '' }]); }}>Save order</MButton>
  </div>;
}

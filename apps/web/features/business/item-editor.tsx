'use client';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useLookups, useVariants } from './common';

export interface ItemRow { productOwner: 'COMPANY' | 'COMPETITOR'; productVariantId?: string | null; competitorProductId?: string | null; brandText?: string | null; skuText?: string | null; quantity: number; unit: string; unitPrice?: number | null }
export const emptyItem = (): ItemRow => ({ productOwner: 'COMPANY', productVariantId: '', quantity: 1, unit: 'pcs', unitPrice: null });

/** Editable transaction lines (company SKU or competitor product / free text). */
export function ItemEditor({ items, onChange }: { items: ItemRow[]; onChange: (items: ItemRow[]) => void }) {
  const variants = useVariants(); const lookups = useLookups();
  const set = (i: number, patch: Partial<ItemRow>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return <div className="space-y-2">
    {items.map((it, i) => <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2">
      <div className="col-span-6 sm:col-span-2"><label className="text-2xs text-ink-muted">Owner</label>
        <Select value={it.productOwner} onChange={(e) => set(i, { productOwner: e.target.value as ItemRow['productOwner'], productVariantId: null, competitorProductId: null })}>
          <option value="COMPANY">Company</option><option value="COMPETITOR">Competitor</option></Select></div>
      <div className="col-span-6 sm:col-span-4"><label className="text-2xs text-ink-muted">Product</label>
        {it.productOwner === 'COMPANY'
          ? <Select aria-label="Company SKU" value={it.productVariantId ?? ''} onChange={(e) => { const v = variants.data?.data.find((x) => x.id === e.target.value); set(i, { productVariantId: e.target.value, unit: v?.unit ?? it.unit, unitPrice: it.unitPrice ?? (v?.listPrice ? Number(v.listPrice) : null) }); }}>
              <option value="">Select SKU…</option>{variants.data?.data.map((v) => <option key={v.id} value={v.id}>{v.sku} – {v.name}</option>)}</Select>
          : <Select aria-label="Competitor product" value={it.competitorProductId ?? ''} onChange={(e) => set(i, { competitorProductId: e.target.value || null })}>
              <option value="">Unmapped (use brand text)…</option>{lookups.data?.competitorProducts.map((c) => <option key={c.id} value={c.id}>{c.brand.name} – {c.name}{c.variant ? ` ${c.variant}` : ''}</option>)}</Select>}
      </div>
      {it.productOwner === 'COMPETITOR' && !it.competitorProductId && <div className="col-span-6 sm:col-span-2"><label className="text-2xs text-ink-muted">Brand text</label><Input value={it.brandText ?? ''} onChange={(e) => set(i, { brandText: e.target.value })} /></div>}
      <div className="col-span-4 sm:col-span-1"><label className="text-2xs text-ink-muted">Qty</label><Input type="number" min={0} step="any" value={it.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} /></div>
      <div className="col-span-4 sm:col-span-1"><label className="text-2xs text-ink-muted">Unit</label><Input value={it.unit} onChange={(e) => set(i, { unit: e.target.value })} /></div>
      <div className="col-span-4 sm:col-span-1"><label className="text-2xs text-ink-muted">Price</label><Input type="number" min={0} step="any" value={it.unitPrice ?? ''} onChange={(e) => set(i, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })} /></div>
      <div className="col-span-12 flex justify-end sm:col-span-1"><Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
    </div>)}
    <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...items, emptyItem()])}><Plus className="h-3.5 w-3.5" />Add line</Button>
  </div>;
}

/** Normalise rows for the API (drops empty optional ids). */
export const cleanItems = (items: ItemRow[]) => items.map((i) => ({
  productOwner: i.productOwner, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice ?? null,
  ...(i.productOwner === 'COMPANY' ? { productVariantId: i.productVariantId || null } : { competitorProductId: i.competitorProductId || null, brandText: i.brandText || null, skuText: i.skuText || null }),
}));

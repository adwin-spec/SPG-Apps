'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { PERMISSIONS, brandSchema, competitorProductSchema, competitorSchema, productSchema, productVariantSchema } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtIdr } from '@/lib/format';
import { PageHeader, Panel, PanelHeader, ErrorBox, Skeleton } from '@/components/ui/card';
import { SimpleTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, emptyToNull, numOrNull } from '@/features/ops/common';

type Variant = { id: string; sku: string; name: string; size: string | null; unit: string; packSize: number | null; listPrice: string | null; isActive: boolean };
type Product = { id: string; code: string; name: string; category: string | null; isActive: boolean; brand: { name: string }; variants: Variant[] };
type Competitor = { id: string; code: string; name: string; isActive: boolean; brands: { id: string; name: string; code: string }[]; products: { id: string; name: string; variant: string | null; sku: string | null; unit: string | null; brand: { name: string } }[] };
type Brand = { id: string; name: string; owner: string; competitorId: string | null };

type Kind = 'product' | 'variant' | 'brand' | 'competitor' | 'competitorProduct';
const CFG: Record<Kind, { title: string; schema: z.ZodType<FieldValues>; path: string }> = {
  product: { title: 'Add company product', schema: productSchema as never, path: '/products' },
  variant: { title: 'Add SKU (variant)', schema: productVariantSchema as never, path: '/product-variants' },
  brand: { title: 'Add brand', schema: brandSchema as never, path: '/brands' },
  competitor: { title: 'Add competitor', schema: competitorSchema as never, path: '/competitors' },
  competitorProduct: { title: 'Add competitor product', schema: competitorProductSchema as never, path: '/competitor-products' },
};

function CreateDialog({ kind, products, competitors, brands, onClose }: { kind: Kind; products: Product[]; competitors: Competitor[]; brands: Brand[]; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const cfg = CFG[kind];
  const form = useForm<FieldValues>({ resolver: zodResolver(cfg.schema as never), defaultValues: kind === 'brand' ? { owner: 'COMPANY' } : {} });
  const m = useMutation({ mutationFn: (v: FieldValues) => api(cfg.path, { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['competitors'] }); qc.invalidateQueries({ queryKey: ['lookups'] }); toast('success', 'Saved'); onClose(); } });
  const e = form.formState.errors as Record<string, { message?: string }>;
  const owner = form.watch('owner'); const competitorId = form.watch('competitorId');
  const txt = (k: string, label: string, req = false, opts: object = {}) => <Field label={label} required={req} error={e[k]?.message}><Input {...form.register(k, opts)} /></Field>;
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={cfg.title}
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>Save</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      {kind === 'product' && <>{txt('code', 'Code', true)}{txt('name', 'Name', true)}
        <Field label="Company brand" required error={e.brandId?.message}><Select {...form.register('brandId')}><option value="">Select…</option>{brands.filter((b) => b.owner === 'COMPANY').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        {txt('category', 'Category', false, { setValueAs: emptyToNull })}</>}
      {kind === 'variant' && <>
        <Field className="sm:col-span-2" label="Product" required error={e.productId?.message}><Select {...form.register('productId')}><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        {txt('sku', 'SKU', true)}{txt('name', 'Variant name', true)}{txt('size', 'Size', false, { setValueAs: emptyToNull })}{txt('unit', 'Unit', true)}
        {txt('packSize', 'Pack size', false, { setValueAs: numOrNull })}{txt('listPrice', 'Reference list price (Rp)', false, { setValueAs: numOrNull })}</>}
      {kind === 'brand' && <>{txt('code', 'Code', true)}{txt('name', 'Name', true)}
        <Field label="Owner" required><Select {...form.register('owner')}><option value="COMPANY">Company</option><option value="COMPETITOR">Competitor</option></Select></Field>
        {owner === 'COMPETITOR' && <Field label="Competitor" error={e.competitorId?.message}><Select {...form.register('competitorId', { setValueAs: emptyToNull })}><option value="">Select…</option>{competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}</>}
      {kind === 'competitor' && <>{txt('code', 'Code', true)}{txt('name', 'Name', true)}</>}
      {kind === 'competitorProduct' && <>
        <Field label="Competitor" required error={e.competitorId?.message}><Select {...form.register('competitorId')}><option value="">Select…</option>{competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Brand" required error={e.brandId?.message}><Select {...form.register('brandId')}><option value="">Select…</option>{brands.filter((b) => b.owner === 'COMPETITOR' && (!competitorId || b.competitorId === competitorId)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        {txt('name', 'Product name', true)}{txt('variant', 'Variant', false, { setValueAs: emptyToNull })}{txt('sku', 'SKU (if known)', false, { setValueAs: emptyToNull })}{txt('unit', 'Unit', false, { setValueAs: emptyToNull })}</>}
    </form>
  </Dialog>;
}

export default function ProductsPage() {
  const { can } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [dialog, setDialog] = useState<Kind | null>(null);
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/products') });
  const competitors = useQuery({ queryKey: ['competitors'], queryFn: () => api<Competitor[]>('/competitors') });
  const lookups = useQuery({ queryKey: ['lookups'], queryFn: () => api<{ brands: Brand[] }>('/lookups') });
  const toggle = useMutation({ mutationFn: (v: Variant) => api(`/product-variants/${v.id}`, { method: 'PATCH', body: { isActive: !v.isActive } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast('success', 'SKU status updated'); }, onError: (e) => toast('error', (e as Error).message) });
  const manage = can(PERMISSIONS.PRODUCT_MANAGE);
  const variants = (products.data ?? []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p.name, brand: p.brand.name, category: p.category })));
  const add = (k: Kind, label: string) => manage && <Button size="sm" variant="secondary" onClick={() => setDialog(k)}><Plus className="h-3.5 w-3.5" />{label}</Button>;
  if (products.error) return <ErrorBox error={products.error} />;
  return <>
    <PageHeader title="Products & competitors" description="Company SKUs and competitor master data used by every transaction and observation" />
    <Tabs defaultValue="company"><TabsList><TabsTrigger value="company">Company SKUs ({variants.length})</TabsTrigger><TabsTrigger value="competitors">Competitors ({competitors.data?.length ?? 0})</TabsTrigger></TabsList>
      <TabsContent value="company"><Panel><PanelHeader title="Company products" actions={<>{add('brand', 'Brand')}{add('product', 'Product')}{add('variant', 'SKU')}</>} />
        {products.isLoading ? <Skeleton className="m-4 h-40" /> : <SimpleTable rows={variants as unknown as Record<string, unknown>[]} columns={[
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Name' }, { key: 'product', label: 'Product' }, { key: 'brand', label: 'Brand' }, { key: 'category', label: 'Category' }, { key: 'unit', label: 'Unit' },
          { key: 'listPrice', label: 'List price', align: 'right', render: (r) => fmtIdr(r.listPrice) },
          { key: 'isActive', label: 'Status', render: (r) => r.isActive ? <Badge tone="good" icon>Active</Badge> : <Badge icon>Inactive</Badge> },
          ...(manage ? [{ key: 'a', label: '', render: (r: Record<string, unknown>) => <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r as unknown as Variant)}>{r.isActive ? 'Deactivate' : 'Activate'}</Button> }] : []),
        ]} />}</Panel></TabsContent>
      <TabsContent value="competitors"><Panel><PanelHeader title="Competitors" actions={<>{add('competitor', 'Competitor')}{add('brand', 'Brand')}{add('competitorProduct', 'Competitor product')}</>} />
        <SimpleTable rows={(competitors.data ?? []).flatMap((c) => (c.products.length ? c.products : [null]).map((p) => ({ competitor: c.name, code: c.code, brands: c.brands.map((b) => b.name).join(', '), product: p ? `${p.name}${p.variant ? ' – ' + p.variant : ''}` : '–', brand: p?.brand.name ?? '–', sku: p?.sku ?? '–', unit: p?.unit ?? '–' }))) as Record<string, unknown>[]}
          columns={[{ key: 'competitor', label: 'Competitor' }, { key: 'code', label: 'Code' }, { key: 'brands', label: 'Brands' }, { key: 'brand', label: 'Product brand' }, { key: 'product', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'unit', label: 'Unit' }]} /></Panel></TabsContent>
    </Tabs>
    {dialog && <CreateDialog kind={dialog} products={products.data ?? []} competitors={competitors.data ?? []} brands={lookups.data?.brands ?? []} onClose={() => setDialog(null)} />}
  </>;
}

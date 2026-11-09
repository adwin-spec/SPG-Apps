'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, RotateCw, XCircle } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api, blobUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtPct, humanize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { KV, errMsg, useOutletOptions, useSpgOptions, useVariants } from '@/features/business/common';
import { ItemEditor, cleanItems, emptyItem, type ItemRow } from '@/features/business/item-editor';

type PF<T> = { value: T | null; confidence: number };
interface Parsed { formId?: PF<string>; reportDate?: PF<string>; spgCode?: PF<string>; wholesalerCode?: PF<string>; retailerName?: PF<string>; overallConfidence?: number; unparsedLines?: string[]; source?: string;
  items?: ({ sku: PF<string>; quantity: PF<number>; unit: PF<string>; unitPrice: PF<number>; raw: string } | { sku: string; brand: string; quantity: number; unit: string; price: number; retailer: string })[] }
interface Review { id: string; reviewerId: string; status: string; corrections: { path: string; originalValue: unknown; correctedValue: unknown }[]; finalPayload: Record<string, unknown>; decisionNote: string | null; createdAt: string; resultTransactionId: string | null }
interface FileLogDetail { id: string; status: string; formId: string | null; duplicateType: string; duplicateOfId: string | null; attempts: number; lastError: string | null; reportDate: string | null; createdAt: string; spgId: string | null; wholesalerOutletId: string | null;
  file: { id: string; originalName: string; mimeType: string; source: string; checksumSha256: string };
  ocrRaw: { id: string; provider: string; rawText: string | null; parsedFields: Parsed; confidence: string | null; createdAt: string; reviews: Review[] }[];
  duplicateOf: { id: string; status: string; formId: string | null; createdAt: string } | null; spg: { fullName: string; employeeCode: string } | null; wholesaler: { name: string; code: string } | null;
  transactions: { id: string; transactionNo: string; validationStatus: string }[] }

const confTone = (c: number | null | undefined) => (c == null || c === 0 ? 'bg-slate-100 text-ink-muted' : c >= 0.85 ? 'bg-good-soft text-good-text' : c >= 0.6 ? 'bg-warn-soft text-warn-text' : 'bg-critical-soft text-critical-text');
function Conf({ label, f }: { label: string; f?: PF<unknown> }) {
  return <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0">
    <span className="text-ink-secondary">{label}</span>
    <span className="flex items-center gap-2"><span className="font-medium">{f?.value == null ? <span className="italic text-ink-muted">not read</span> : String(f.value)}</span>
      <span className={cn('num rounded px-1.5 text-2xs', confTone(f?.confidence))} title="Field confidence">{f?.confidence ? fmtPct(f.confidence * 100) : '—'}</span></span></div>;
}

export default function OcrReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['file-log', id], queryFn: () => api<FileLogDetail>(`/ocr/file-logs/${id}`), refetchInterval: (qq) => (['UPLOADED', 'PROCESSING'].includes(qq.state.data?.status ?? '') ? 3000 : false) });
  const d = q.data; const raw = d?.ocrRaw[0]; const parsed = raw?.parsedFields ?? {};
  const pending = raw?.reviews.find((r) => r.status === 'PENDING');
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => { let u: string | null = null; if (d?.file.id) blobUrl(`/files/${d.file.id}/content`).then((x) => { u = x; setImg(x); }).catch(() => setImg(null)); return () => { if (u) URL.revokeObjectURL(u); }; }, [d?.file.id]);

  const spgs = useSpgOptions('GROSIR'); const wsOpts = useOutletOptions('WHOLESALER'); const variants = useVariants();
  const [form, setForm] = useState({ spgId: '', wholesalerOutletId: '', retailerOutletId: '', transactionDate: '' });
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const retailers = useOutletOptions('RETAILER', { wholesalerId: form.wholesalerOutletId || undefined }, !!form.wholesalerOutletId);
  const originals = useRef<Record<string, unknown>>({});
  const prefilled = useRef(false);

  // Prefill from parsed OCR / sheet fields once master data is loaded; remember originals for correction tracking.
  useEffect(() => {
    if (prefilled.current || !d || !raw || !spgs.data || !wsOpts.data || !variants.data) return;
    prefilled.current = true;
    const spg = d.spgId ? spgs.data.data.find((s) => s.id === d.spgId) : spgs.data.data.find((s) => s.employeeCode === parsed.spgCode?.value);
    const ws = d.wholesalerOutletId ? wsOpts.data.data.find((w) => w.id === d.wholesalerOutletId) : wsOpts.data.data.find((w) => w.code === parsed.wholesalerCode?.value);
    const date = parsed.reportDate?.value ?? d.reportDate?.slice(0, 10) ?? '';
    setForm({ spgId: spg?.id ?? '', wholesalerOutletId: ws?.id ?? '', retailerOutletId: '', transactionDate: date });
    const o: Record<string, unknown> = { spgCode: parsed.spgCode?.value ?? null, wholesalerCode: parsed.wholesalerCode?.value ?? null, retailerName: parsed.retailerName?.value ?? null, transactionDate: parsed.reportDate?.value ?? null };
    const rows: ItemRow[] = (parsed.items ?? []).map((it, i) => {
      const n = 'raw' in it ? { sku: it.sku.value, quantity: it.quantity.value, unit: it.unit.value, price: it.unitPrice.value } : { sku: it.sku, quantity: it.quantity, unit: it.unit, price: it.price };
      Object.assign(o, { [`items[${i}].sku`]: n.sku ?? null, [`items[${i}].quantity`]: n.quantity ?? null, [`items[${i}].unit`]: n.unit ?? null, [`items[${i}].unitPrice`]: n.price ?? null });
      const v = variants.data!.data.find((x) => x.sku.toUpperCase() === String(n.sku ?? '').toUpperCase());
      return v ? { productOwner: 'COMPANY', productVariantId: v.id, quantity: Number(n.quantity ?? 1), unit: n.unit ?? v.unit, unitPrice: n.price ?? null }
        : { productOwner: 'COMPETITOR', competitorProductId: null, brandText: 'brand' in it ? it.brand : null, skuText: n.sku ?? null, quantity: Number(n.quantity ?? 1), unit: n.unit ?? 'pcs', unitPrice: n.price ?? null };
    });
    originals.current = o;
    if (rows.length) setItems(rows);
  }, [d, raw, spgs.data, wsOpts.data, variants.data, parsed]);
  useEffect(() => { // auto-pick retailer from parsed name once retailer list arrives
    const name = String(originals.current.retailerName ?? '').toLowerCase();
    if (!form.retailerOutletId && name && retailers.data) { const r = retailers.data.data.find((x) => x.name.toLowerCase().includes(name) || name.includes(x.name.toLowerCase())); if (r) setForm((f) => ({ ...f, retailerOutletId: r.id })); }
  }, [retailers.data, form.retailerOutletId]);

  const corrections = useMemo(() => {
    const o = originals.current; const out: { path: string; originalValue: unknown; correctedValue: unknown; reason?: string }[] = [];
    const push = (path: string, cv: unknown) => { if (!(path in o)) { if (cv != null && cv !== '') out.push({ path, originalValue: null, correctedValue: cv, reason: 'Not read by OCR – entered manually' }); return; }
      if (String(o[path] ?? '') !== String(cv ?? '')) out.push({ path, originalValue: o[path], correctedValue: cv }); };
    push('spgCode', spgs.data?.data.find((s) => s.id === form.spgId)?.employeeCode ?? null);
    push('wholesalerCode', wsOpts.data?.data.find((w) => w.id === form.wholesalerOutletId)?.code ?? null);
    push('retailerName', retailers.data?.data.find((r) => r.id === form.retailerOutletId)?.name ?? null);
    push('transactionDate', form.transactionDate || null);
    items.forEach((it, i) => {
      push(`items[${i}].sku`, it.productOwner === 'COMPANY' ? variants.data?.data.find((v) => v.id === it.productVariantId)?.sku ?? null : it.skuText ?? it.competitorProductId ?? null);
      push(`items[${i}].quantity`, it.quantity); push(`items[${i}].unit`, it.unit); push(`items[${i}].unitPrice`, it.unitPrice ?? null);
    });
    return out;
  }, [form, items, spgs.data, wsOpts.data, retailers.data, variants.data]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['file-log', id] }); qc.invalidateQueries({ queryKey: ['file-logs'] }); qc.invalidateQueries({ queryKey: ['ocr-counts'] }); };
  const [err, setErr] = useState<string | null>(null);
  const submit = useMutation({ mutationFn: () => api<Review>(`/ocr/file-logs/${id}/reviews`, { method: 'POST', body: { final: { ...form, wholesalerOutletId: form.wholesalerOutletId || null, items: cleanItems(items) }, corrections } }),
    onSuccess: () => { toast('success', 'Review submitted – waiting for a second person to approve'); setErr(null); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const [decision, setDecision] = useState<null | 'APPROVED' | 'REJECTED'>(null); const [note, setNote] = useState(''); const [derr, setDerr] = useState<string | null>(null);
  const decide = useMutation({ mutationFn: () => api<{ status: string; transactionId: string | null }>(`/ocr/reviews/${pending!.id}/decision`, { method: 'POST', body: { decision, note: note || null } }),
    onSuccess: (r) => { toast('success', r.transactionId ? 'Approved – transaction created' : 'Review rejected'); setDecision(null); setNote(''); refresh(); }, onError: (e) => setDerr(errMsg(e)) });
  const retry = useMutation({ mutationFn: () => api(`/ocr/file-logs/${id}/retry`, { method: 'POST' }), onSuccess: () => { toast('info', 'OCR retry queued'); refresh(); }, onError: (e) => toast('error', errMsg(e)) });
  const [rejOpen, setRejOpen] = useState(false); const [rejReason, setRejReason] = useState('');
  const reject = useMutation({ mutationFn: () => api(`/ocr/file-logs/${id}/reject`, { method: 'POST', body: { reason: rejReason } }), onSuccess: () => { toast('success', 'Submission rejected'); setRejOpen(false); refresh(); }, onError: (e) => toast('error', errMsg(e)) });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !d) return <ErrorBox error={q.error} />;
  const final = ['APPROVED', 'REJECTED'].includes(d.status);
  const canEdit = can(PERMISSIONS.OCR_REVIEW) && d.status === 'NEEDS_REVIEW';
  const ownReview = pending && pending.reviewerId === user?.id;
  const valid = form.spgId && form.retailerOutletId && form.transactionDate && items.length && items.every((i) => i.quantity > 0 && i.unit && (i.productOwner === 'COMPANY' ? i.productVariantId : i.competitorProductId || i.brandText));

  return <>
    <Link href="/integrations" className="mb-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ArrowLeft className="h-3 w-3" />OCR queue</Link>
    <PageHeader title={d.formId ? `Form ${d.formId}` : d.file.originalName} description={`${d.file.source === 'GOOGLE_DRIVE' ? 'Google Drive' : 'App upload'} · received ${fmtDateTime(d.createdAt)} · ${d.attempts} OCR attempt(s)`}
      actions={<>
        <StatusBadge status={d.status} />
        {d.status === 'SYNC_FAILED' && can(PERMISSIONS.OCR_REVIEW) && <Button variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()}><RotateCw className="h-4 w-4" />Retry OCR</Button>}
        {!final && can(PERMISSIONS.OCR_REVIEW) && <Button variant="danger" onClick={() => setRejOpen(true)}><XCircle className="h-4 w-4" />Reject submission</Button>}
      </>} />
    <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-200 bg-primary-soft px-3 py-2 text-sm text-ink-secondary"><Info className="mt-0.5 h-4 w-4 text-primary" />
      OCR output is a suggestion only. The original photo and raw OCR text are never modified; your corrections are stored separately. A retailer transaction is created only after a second person approves the review.</div>
    {d.duplicateType !== 'NONE' && <div role="alert" className={cn('mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm', d.duplicateType === 'EXACT_DUPLICATE' ? 'border-critical/30 bg-critical-soft text-critical-text' : 'border-amber-200 bg-warn-soft text-warn-text')}>
      <AlertTriangle className="mt-0.5 h-4 w-4" /><span><b>{humanize(d.duplicateType)}</b>{d.duplicateOf && <> of <Link className="underline" href={`/integrations/${d.duplicateOf.id}`}>{d.duplicateOf.formId ?? 'an earlier submission'}</Link> ({humanize(d.duplicateOf.status)}, {fmtDate(d.duplicateOf.createdAt)})</>}.
        {d.duplicateType === 'EXACT_DUPLICATE' ? ' Identical file – it cannot be approved; reject it.' : ' Compare with the earlier submission before approving.'} Nothing is deleted automatically.</span></div>}
    {d.lastError && <div className="mb-3"><ErrorBox error={new Error(`Last error: ${d.lastError}`)} /></div>}

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader title="Original document" subtitle={`${d.file.originalName} · SHA-256 ${d.file.checksumSha256.slice(0, 12)}…`} />
        <PanelBody className="bg-surface">{!img ? <Skeleton className="h-96" /> : d.file.mimeType === 'application/pdf'
          ? <object data={img} type="application/pdf" className="h-[640px] w-full" aria-label="Original PDF"><a href={img}>Open PDF</a></object>
          : <a href={img} target="_blank" rel="noreferrer"><img src={img} alt="Original paper form" className="mx-auto max-h-[640px] w-auto rounded border border-border bg-white object-contain" style={{ imageRendering: 'auto' }} /></a>}</PanelBody></Panel>
      <div className="space-y-4">
        <Panel><PanelHeader title="OCR result" subtitle={raw ? `${raw.provider} · ${fmtDateTime(raw.createdAt)}` : 'Waiting for OCR worker…'}
          actions={raw && <span className={cn('num rounded px-2 py-0.5 text-xs font-medium', confTone(raw.confidence == null ? null : Number(raw.confidence)))}>Overall {raw.confidence == null ? 'n/a' : fmtPct(Number(raw.confidence) * 100)}</span>} />
          <PanelBody>{!raw ? <p className="text-sm text-ink-muted">{['UPLOADED', 'PROCESSING'].includes(d.status) ? 'Processing… this page refreshes automatically.' : 'No OCR output.'}</p> : <>
            {raw.provider === 'none' && <p className="mb-2 rounded bg-warn-soft px-2 py-1.5 text-xs text-warn-text">OCR provider is disabled (OCR_PROVIDER=none): transcribe the form manually below.</p>}
            {parsed.source === 'INPUT_HARIAN' && <p className="mb-2 rounded bg-primary-soft px-2 py-1.5 text-xs text-primary">Imported from the INPUT_HARIAN sheet (human transcription). Still requires review and approval.</p>}
            <Conf label="Form ID" f={parsed.formId} /><Conf label="Date" f={parsed.reportDate} /><Conf label="SPG code" f={parsed.spgCode} /><Conf label="Grosir code" f={parsed.wholesalerCode} /><Conf label="Retailer" f={parsed.retailerName} />
            <div className="mt-2 text-xs font-semibold uppercase text-ink-muted">Item lines read ({parsed.items?.length ?? 0})</div>
            <ul className="mt-1 space-y-1">{(parsed.items ?? []).map((it, i) => <li key={i} className="rounded bg-surface px-2 py-1 text-xs">{'raw' in it ? <>
              <span className={cn('rounded px-1', confTone(it.sku.confidence))}>{it.sku.value ?? '?'}</span> × <span className={cn('rounded px-1', confTone(it.quantity.confidence))}>{it.quantity.value ?? '?'}</span> {it.unit.value ?? ''} @ <span className={cn('rounded px-1', confTone(it.unitPrice.confidence))}>{it.unitPrice.value ?? '?'}</span>
              <span className="ml-2 text-ink-muted">“{it.raw}”</span></> : <>{it.sku} × {it.quantity} {it.unit} @ {it.price} · {it.brand}</>}</li>)}</ul>
            {!!parsed.unparsedLines?.length && <details className="mt-2 text-xs"><summary className="cursor-pointer text-ink-secondary">{parsed.unparsedLines.length} unparsed line(s)</summary><ul className="mt-1 list-disc pl-5 text-ink-muted">{parsed.unparsedLines.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-ink-secondary">Raw OCR text</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-2">{raw.rawText || '(empty)'}</pre></details>
          </>}</PanelBody></Panel>

        {pending && <Panel className="border-amber-300"><PanelHeader title="Review awaiting approval" subtitle={`Submitted ${fmtDateTime(pending.createdAt)}`}
          actions={can(PERMISSIONS.OCR_APPROVE) && !ownReview && <><Button size="sm" variant="success" onClick={() => { setDerr(null); setDecision('APPROVED'); }}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>
            <Button size="sm" variant="danger" onClick={() => { setDerr(null); setDecision('REJECTED'); }}><XCircle className="h-3.5 w-3.5" />Reject</Button></>} />
          <PanelBody>{ownReview && <p className="mb-2 rounded bg-warn-soft px-2 py-1.5 text-xs text-warn-text">You submitted this review. Maker–checker rule: another user with OCR approval rights must approve it.</p>}
            <dl className="grid grid-cols-2 gap-2 text-sm"><KV k="Date" v={String(pending.finalPayload.transactionDate)} /><KV k="Lines" v={(pending.finalPayload.items as unknown[]).length} /></dl>
            <div className="mt-2 text-xs font-semibold uppercase text-ink-muted">Corrections ({pending.corrections.length})</div>
            <ul className="mt-1 space-y-0.5 text-xs">{pending.corrections.map((c, i) => <li key={i}><code>{c.path}</code>: <span className="text-critical-text line-through">{String(c.originalValue ?? '∅')}</span> → <span className="text-good-text">{String(c.correctedValue ?? '∅')}</span></li>)}
              {!pending.corrections.length && <li className="text-ink-muted">None – OCR values accepted as read.</li>}</ul></PanelBody></Panel>}

        {d.transactions.length > 0 && <Panel><PanelHeader title="Resulting transaction" /><PanelBody>{d.transactions.map((t) => <div key={t.id} className="flex items-center justify-between text-sm">
          <Link className="text-primary hover:underline" href={`/grosir/transactions/${t.id}`}>{t.transactionNo}</Link><StatusBadge status={t.validationStatus} /></div>)}</PanelBody></Panel>}
        {raw && raw.reviews.filter((r) => r.status !== 'PENDING').length > 0 && <Panel><PanelHeader title="Review history" /><PanelBody><ul className="space-y-1 text-sm">{raw.reviews.filter((r) => r.status !== 'PENDING').map((r) => <li key={r.id} className="flex items-center justify-between">
          <span>{fmtDateTime(r.createdAt)} · {r.corrections.length} correction(s){r.decisionNote && <span className="text-ink-muted"> – {r.decisionNote}</span>}</span><StatusBadge status={r.status} /></li>)}</ul></PanelBody></Panel>}
      </div>
    </div>

    {canEdit && <Panel className="mt-4"><PanelHeader title={pending ? 'Replace the pending review' : 'Review & correct'} subtitle="Confirm every field against the photo. Changed values are recorded as corrections (original → corrected)." />
      <PanelBody>
        {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="SPG" required><Select value={form.spgId} onChange={(e) => setForm({ ...form, spgId: e.target.value })}><option value="">Select…</option>{spgs.data?.data.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.employeeCode})</option>)}</Select></Field>
          <Field label="Wholesaler"><Select value={form.wholesalerOutletId} onChange={(e) => setForm({ ...form, wholesalerOutletId: e.target.value, retailerOutletId: '' })}><option value="">Select…</option>{wsOpts.data?.data.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}</Select></Field>
          <Field label="Retailer" required hint={form.wholesalerOutletId ? undefined : 'Choose the wholesaler first'}><Select value={form.retailerOutletId} disabled={!form.wholesalerOutletId} onChange={(e) => setForm({ ...form, retailerOutletId: e.target.value })}><option value="">Select…</option>{retailers.data?.data.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</Select></Field>
          <Field label="Transaction date" required><Input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} /></Field>
        </div>
        <div className="mt-4"><ItemEditor items={items} onChange={setItems} /></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-ink-muted">{corrections.length} field correction(s) will be recorded.</p>
          <Button disabled={!valid} loading={submit.isPending} onClick={() => submit.mutate()}>Submit review for approval</Button>
        </div>
      </PanelBody></Panel>}

    <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)} title={decision === 'APPROVED' ? 'Approve OCR review' : 'Reject OCR review'}
      description={decision === 'APPROVED' ? 'An APPROVED retailer transaction (source OCR) will be created from the reviewed payload.' : 'No transaction is created; the submission stays on file.'}
      footer={<><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision === 'APPROVED' ? 'success' : 'danger'} loading={decide.isPending} onClick={() => decide.mutate()}>Confirm</Button></>}>
      {derr && <div className="mb-3"><ErrorBox error={new Error(derr)} /></div>}
      <Field label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
    <Dialog open={rejOpen} onOpenChange={setRejOpen} title="Reject submission" description="Use for unreadable, irrelevant or duplicate forms. The file is kept for audit."
      footer={<><Button variant="secondary" onClick={() => setRejOpen(false)}>Cancel</Button><Button variant="danger" disabled={rejReason.trim().length < 3} loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button></>}>
      <Field label="Reason" required><Textarea value={rejReason} onChange={(e) => setRejReason(e.target.value)} /></Field>
    </Dialog>
  </>;
}

'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Undo2, PencilLine, AlertTriangle } from 'lucide-react';
import { PERMISSIONS } from '@tanda/shared';
import { api, blobUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtIdr, fmtNum, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { ErrorBox, PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { SimpleTable } from '@/components/data-table';
import { useToast } from '@/components/ui/toast';
import { KV, NatureBadge, SourceBadge, errMsg } from '@/features/business/common';
import { ItemEditor, cleanItems, type ItemRow } from '@/features/business/item-editor';

interface Item { lineNo: number; productOwner: 'COMPANY' | 'COMPETITOR'; productVariantId: string | null; competitorProductId: string | null; brandText: string | null; skuText: string | null; productText: string | null; quantity: string; unit: string; unitPrice: string | null; lineTotal: string | null;
  productVariant: { sku: string; name: string } | null; competitorProduct: { name: string; variant: string | null; brand: { name: string } } | null }
interface Tx { id: string; transactionNo: string; transactionDate: string; dataNature: string; source: string; validationStatus: string; validationIssues: { rule: string; severity: string; message: string }[] | null;
  duplicateType: string; duplicateOfId: string | null; correctionOfId: string | null; correctionReason: string | null; totalValue: string; totalQuantity: string; notes: string | null; evidenceFileId: string | null; fileLogId: string | null;
  createdAt: string; approvedAt: string | null; visitId: string | null; wholesalerOutletId: string | null; spgId: string;
  retailer: { id: string; code: string; name: string }; wholesaler: { id: string; code: string; name: string } | null; spg: { fullName: string; employeeCode: string }; items: Item[];
  related: { id: string; transactionNo: string; validationStatus: string; createdAt: string; correctionOfId: string | null }[];
  auditTrail: { id: string; action: string; createdAt: string; reason: string | null; actorId: string | null; before: unknown; after: unknown }[] }

const REVIEWABLE = ['SUBMITTED', 'VALIDATED', 'NEEDS_REVIEW'];

export default function TransactionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['retailer-transaction', id], queryFn: () => api<Tx>(`/retailer-transactions/${id}`) });
  const t = q.data;
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => { let u: string | null = null; if (t?.evidenceFileId) blobUrl(`/files/${t.evidenceFileId}/content`).then((x) => { u = x; setImg(x); }).catch(() => setImg(null)); return () => { if (u) URL.revokeObjectURL(u); }; }, [t?.evidenceFileId]);
  const [dialog, setDialog] = useState<null | 'APPROVED' | 'REJECTED' | 'reversal' | 'correction'>(null);
  const [note, setNote] = useState(''); const [items, setItems] = useState<ItemRow[]>([]); const [err, setErr] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['retailer-transaction', id] }); qc.invalidateQueries({ queryKey: ['retailer-transactions'] }); };
  const close = () => { setDialog(null); setNote(''); setErr(null); };
  const decide = useMutation({ mutationFn: (decision: 'APPROVED' | 'REJECTED') => api(`/retailer-transactions/${id}/decision`, { method: 'POST', body: { decision, note: note || null } }),
    onSuccess: (_, d) => { toast('success', d === 'APPROVED' ? 'Transaction approved' : 'Transaction rejected'); close(); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const reversal = useMutation({ mutationFn: () => api(`/retailer-transactions/${id}/reversal-requests`, { method: 'POST', body: { reason: note } }),
    onSuccess: () => { toast('success', 'Reversal requested – a second approver must decide it in Approvals'); close(); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const correction = useMutation({ mutationFn: () => api<{ id: string; transactionNo: string }>(`/retailer-transactions/${id}/corrections`, { method: 'POST', body: { clientId: crypto.randomUUID(), reason: note, items: cleanItems(items) } }),
    onSuccess: (r) => { toast('success', `Correction ${r.transactionNo} submitted for approval`); close(); refresh(); }, onError: (e) => setErr(errMsg(e)) });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !t) return <ErrorBox error={q.error} />;
  const reviewable = REVIEWABLE.includes(t.validationStatus);
  const own = t.spgId === user?.spgId;
  const openCorrection = () => { setItems(t.items.map((i) => ({ productOwner: i.productOwner, productVariantId: i.productVariantId, competitorProductId: i.competitorProductId, brandText: i.brandText, skuText: i.skuText, quantity: Number(i.quantity), unit: i.unit, unitPrice: i.unitPrice == null ? null : Number(i.unitPrice) }))); setDialog('correction'); };
  const exactDup = t.duplicateType === 'EXACT_DUPLICATE';

  return <>
    <Link href="/grosir" className="mb-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ArrowLeft className="h-3 w-3" />Retailer transactions</Link>
    <PageHeader title={t.transactionNo} description={`${t.retailer.name} · ${fmtDate(t.transactionDate)} · recorded ${fmtDateTime(t.createdAt)}`}
      actions={<>
        {can(PERMISSIONS.TRANSACTION_APPROVE) && reviewable && !own && <>
          <Button variant="success" onClick={() => setDialog('APPROVED')}><CheckCircle2 className="h-4 w-4" />Approve</Button>
          <Button variant="danger" onClick={() => setDialog('REJECTED')}><XCircle className="h-4 w-4" />Reject</Button></>}
        {can(PERMISSIONS.TRANSACTION_CORRECT) && !['REJECTED', 'SUPERSEDED', 'REVERSED'].includes(t.validationStatus) && <Button variant="secondary" onClick={openCorrection}><PencilLine className="h-4 w-4" />Submit correction</Button>}
        {can(PERMISSIONS.TRANSACTION_CORRECT) && t.validationStatus === 'APPROVED' && <Button variant="secondary" onClick={() => setDialog('reversal')}><Undo2 className="h-4 w-4" />Request reversal</Button>}
      </>} />

    {exactDup && <div role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical-text"><AlertTriangle className="mt-0.5 h-4 w-4" />
      <span>Flagged as an exact duplicate{t.duplicateOfId && <> of <Link className="underline" href={`/grosir/transactions/${t.duplicateOfId}`}>an earlier transaction</Link></>}. It is not deleted; approve only with a justification, otherwise reject.</span></div>}
    {t.duplicateType === 'POTENTIAL_DUPLICATE' && t.duplicateOfId && <div className="mb-3 rounded-md border border-amber-200 bg-warn-soft px-3 py-2 text-sm text-warn-text">Potential duplicate of <Link className="underline" href={`/grosir/transactions/${t.duplicateOfId}`}>another transaction</Link> (same retailer, date and value). Compare before approving.</div>}

    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Panel><PanelBody><dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KV k="Validation" v={<StatusBadge status={t.validationStatus} />} /><KV k="Data nature" v={<NatureBadge nature={t.dataNature} />} />
          <KV k="Source" v={<SourceBadge source={t.source} />} /><KV k="Duplicate" v={t.duplicateType === 'NONE' ? 'None' : <StatusBadge status={t.duplicateType} />} />
          <KV k="Retailer" v={<Link className="text-primary hover:underline" href={`/grosir/retailers/${t.retailer.id}`}>{t.retailer.name}</Link>} />
          <KV k="Grosir" v={t.wholesaler ? <Link className="text-primary hover:underline" href={`/grosir/wholesalers/${t.wholesaler.id}`}>{t.wholesaler.name}</Link> : '–'} />
          <KV k="SPG" v={`${t.spg.fullName} (${t.spg.employeeCode})`} /><KV k="Approved at" v={t.approvedAt ? fmtDateTime(t.approvedAt) : '–'} />
          <KV k="Total quantity" v={fmtNum(t.totalQuantity)} /><KV k="Total value" v={<span className="font-semibold">{fmtIdr(t.totalValue)}</span>} />
          {t.visitId && <KV k="Visit" v={<Link className="text-primary hover:underline" href={`/attendance/visits/${t.visitId}`}>Open visit</Link>} />}
          {t.fileLogId && <KV k="Paper form" v={<Link className="text-primary hover:underline" href={`/integrations/${t.fileLogId}`}>OCR record</Link>} />}
        </dl>{t.notes && <p className="mt-3 text-sm text-ink-secondary">Notes: {t.notes}</p>}
          {t.correctionReason && <p className="mt-2 text-sm text-ink-secondary">Correction / reversal reason: {t.correctionReason}</p>}</PanelBody></Panel>

        <Panel><PanelHeader title="Line items" subtitle="Company and competitor lines are kept separate; competitor lines never count as company sales" />
          <SimpleTable rows={t.items as unknown as Record<string, unknown>[]} columns={[
            { key: 'lineNo', label: '#' },
            { key: 'owner', label: 'Owner', render: (r) => <Badge tone={r.productOwner === 'COMPANY' ? 'info' : 'serious'}>{r.productOwner === 'COMPANY' ? 'Company' : 'Competitor'}</Badge> },
            { key: 'product', label: 'Product / SKU', render: (r) => { const i = r as unknown as Item; return i.productVariant ? <span>{i.productVariant.sku} – {i.productVariant.name}</span>
              : i.competitorProduct ? <span>{i.competitorProduct.brand.name} – {i.competitorProduct.name}{i.competitorProduct.variant ? ` ${i.competitorProduct.variant}` : ''}</span>
              : <span className="italic text-ink-secondary">{[i.brandText, i.skuText, i.productText].filter(Boolean).join(' · ') || '–'} <Badge tone="warn">unmapped</Badge></span>; } },
            { key: 'quantity', label: 'Qty', align: 'right', render: (r) => fmtNum(r.quantity) }, { key: 'unit', label: 'Unit' },
            { key: 'unitPrice', label: 'Price', align: 'right', render: (r) => r.unitPrice == null ? <Badge tone="warn">missing</Badge> : fmtIdr(r.unitPrice) },
            { key: 'lineTotal', label: 'Total', align: 'right', render: (r) => fmtIdr(r.lineTotal) }]} /></Panel>

        <Panel><PanelHeader title="Audit trail" subtitle="Append-only; every state change with actor, time and reason" />
          <PanelBody><ol className="relative ml-2 border-l border-border">{t.auditTrail.map((a) => <li key={a.id} className="mb-3 ml-4">
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-primary" aria-hidden />
            <div className="text-sm font-medium">{humanize(a.action)}</div>
            <div className="text-2xs text-ink-muted">{fmtDateTime(a.createdAt)}{a.actorId ? ` · actor ${a.actorId.slice(0, 8)}` : ''}</div>
            {a.reason && <div className="text-xs text-ink-secondary">Reason: {a.reason}</div>}
            {a.after != null && <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface p-2 text-2xs text-ink-secondary">{JSON.stringify(a.after, null, 1)}</pre>}
          </li>)}{!t.auditTrail.length && <li className="ml-4 text-sm text-ink-muted">No audit entries.</li>}</ol></PanelBody></Panel>
      </div>

      <div className="space-y-4">
        <Panel><PanelHeader title="Automated validation" subtitle="Rules run on submission (raw → validated / needs review)" />
          <PanelBody>{t.validationIssues?.length ? <ul className="space-y-2">{t.validationIssues.map((i, k) => <li key={k} className="flex items-start gap-2 text-sm">
            <StatusBadge status={i.severity === 'INFO' ? 'INFO' : i.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING'} /><span>{i.message}</span></li>)}</ul>
            : <p className="text-sm text-good-text">All automated checks passed.</p>}</PanelBody></Panel>
        <Panel><PanelHeader title="Correction chain" />
          <PanelBody>{t.correctionOfId && <p className="mb-2 text-sm">Corrects <Link className="text-primary hover:underline" href={`/grosir/transactions/${t.correctionOfId}`}>original transaction</Link>.</p>}
            {t.related.filter((r) => r.id !== t.correctionOfId).length ? <ul className="space-y-1">{t.related.filter((r) => r.id !== t.correctionOfId).map((r) => <li key={r.id} className="flex items-center justify-between text-sm">
              <Link className="text-primary hover:underline" href={`/grosir/transactions/${r.id}`}>{r.transactionNo}</Link><StatusBadge status={r.validationStatus} /></li>)}</ul>
              : !t.correctionOfId && <p className="text-sm text-ink-muted">No corrections.</p>}</PanelBody></Panel>
        <Panel><PanelHeader title="Evidence" />
          <PanelBody>{t.evidenceFileId ? img ? <a href={img} target="_blank" rel="noreferrer"><img src={img} alt="Transaction evidence" className="max-h-80 w-full rounded border border-border object-contain" /></a> : <Skeleton className="h-40" /> : <p className="text-sm text-ink-muted">No evidence attached.</p>}</PanelBody></Panel>
      </div>
    </div>

    <Dialog open={dialog === 'APPROVED' || dialog === 'REJECTED'} onOpenChange={(o) => !o && close()} title={dialog === 'APPROVED' ? 'Approve transaction' : 'Reject transaction'}
      description={dialog === 'APPROVED' ? 'Approved transactions become final, enter KPIs, and can afterwards only be corrected or reversed.' : 'Rejected transactions stay on record but never count.'}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant={dialog === 'APPROVED' ? 'success' : 'danger'} loading={decide.isPending} disabled={dialog === 'APPROVED' && exactDup && !note.trim()} onClick={() => decide.mutate(dialog as 'APPROVED' | 'REJECTED')}>Confirm</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      <Field label={exactDup && dialog === 'APPROVED' ? 'Justification (required for an exact duplicate)' : 'Note (optional)'} required={exactDup && dialog === 'APPROVED'}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
    <Dialog open={dialog === 'reversal'} onOpenChange={(o) => !o && close()} title="Request reversal" description="The transaction is marked REVERSED only after a second person approves this request in Approvals. Nothing is deleted."
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="danger" loading={reversal.isPending} disabled={note.trim().length < 5} onClick={() => reversal.mutate()}>Request reversal</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      <Field label="Reason (min. 5 characters)" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
    <Dialog size="xl" open={dialog === 'correction'} onOpenChange={(o) => !o && close()} title="Submit correction"
      description="A new transaction is created referencing this one. The original stays unchanged and is superseded only when the correction is approved."
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={correction.isPending} disabled={note.trim().length < 5 || !items.length} onClick={() => correction.mutate()}>Submit correction</Button></>}>
      {err && <div className="mb-3"><ErrorBox error={new Error(err)} /></div>}
      <Field label="Reason (min. 5 characters)" required className="mb-3"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ItemEditor items={items} onChange={setItems} />
    </Dialog>
  </>;
}

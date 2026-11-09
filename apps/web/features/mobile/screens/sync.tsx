'use client';
import { AlertTriangle, CheckCircle2, CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { discard, retry, syncNow } from '@/lib/offline/outbox';
import { useOnline, useOutbox } from '@/lib/offline/use-outbox';
import { fmtDateTime } from '@/lib/format';
import { Card, MButton } from '../kit';

export function SyncScreen() {
  const online = useOnline(); const { ops, pending, problems } = useOutbox();
  return <div className="space-y-3">
    <Card><h1 className="text-base font-semibold">Sync center</h1>
      <p className="mt-1 text-sm text-ink-secondary">{online ? 'Online' : 'Offline'} · {pending} waiting · {problems} need your action</p>
      <p className="mt-1 text-xs text-ink-muted">Every entry has a unique ID, so re-sending never creates duplicates. Conflicts are never overwritten silently – you decide.</p>
      <MButton className="mt-3" disabled={!online || !ops.length} onClick={() => void syncNow()}><RefreshCw className="h-5 w-5" />Sync now</MButton></Card>
    {!ops.length ? <Card className="flex items-center gap-2 text-sm text-good-text"><CheckCircle2 className="h-5 w-5" />Everything is synced.</Card>
      : <Card className="p-0"><ul className="divide-y divide-border">{ops.map((o) => <li key={o.id} className="px-4 py-3">
        <div className="flex items-start gap-2">
          {o.status === 'conflict' || o.status === 'failed' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-label={o.status} /> : <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label={o.status} />}
          <div className="min-w-0 flex-1"><div className="text-sm font-medium">{o.label}</div>
            <div className="text-xs text-ink-muted">{fmtDateTime(new Date(o.createdAt).toISOString())} · {o.status}{o.attempts ? ` · ${o.attempts} attempt(s)` : ''}</div>
            {o.error && <div className={`mt-1 rounded px-2 py-1 text-xs ${o.status === 'pending' ? 'bg-surface text-ink-secondary' : 'bg-critical-soft text-critical-text'}`}>{o.error}</div>}
            {o.status === 'conflict' && <p className="mt-1 text-xs text-ink-secondary">The server already holds a different record (e.g. you checked in on another device, or the report was already submitted). Discard this copy if the server version is correct, or contact your supervisor.</p>}
          </div></div>
        {(o.status === 'failed' || o.status === 'conflict') && <div className="mt-2 flex gap-2">
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium" onClick={() => void retry(o.id)}>Retry</button>
          <button className="flex items-center gap-1 rounded-lg border border-critical/40 px-3 py-1.5 text-xs font-medium text-critical-text" onClick={() => { if (confirm('Discard this entry? It will not be sent.')) void discard(o.id); }}><Trash2 className="h-3.5 w-3.5" />Discard</button></div>}
      </li>)}</ul></Card>}
  </div>;
}

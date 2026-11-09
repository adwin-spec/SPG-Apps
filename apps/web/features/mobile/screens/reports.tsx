'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { dailyReportSchema, jakartaDate } from '@tanda/shared';
import { apiPage } from '@/lib/api';
import { enqueue, newId } from '@/lib/offline/outbox';
import { useOnline } from '@/lib/offline/use-outbox';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useField } from '../field-state';
import { Card, MButton, MField, mInput, validatePayload } from '../kit';
import { StatusBadge } from '@/components/ui/badge';

/** Separate daily report form per SPG category (never one generic form). */
const FIELDS: Record<string, { key: string; label: string; type: 'int' | 'text' }[]> = {
  GROSIR: [{ key: 'wholesalersVisited', label: 'Wholesalers visited', type: 'int' }, { key: 'retailersRecorded', label: 'Retailers recorded', type: 'int' }, { key: 'marketHighlights', label: 'Market highlights', type: 'text' }, { key: 'competitorHighlights', label: 'Competitor highlights', type: 'text' }, { key: 'stockIssues', label: 'Stock issues', type: 'text' }],
  HORECA: [{ key: 'outletsVisited', label: 'Outlets visited', type: 'int' }, { key: 'newOutletsApproached', label: 'New outlets approached', type: 'int' }, { key: 'programsExecuted', label: 'Programs executed', type: 'int' }, { key: 'keyAccountNotes', label: 'Key account notes', type: 'text' }, { key: 'competitorHighlights', label: 'Competitor highlights', type: 'text' }],
  REGULER: [{ key: 'outletsVisited', label: 'Outlets visited', type: 'int' }, { key: 'ordersTaken', label: 'Orders taken', type: 'int' }, { key: 'oosFindings', label: 'Out-of-stock findings', type: 'text' }, { key: 'displayNotes', label: 'Display notes', type: 'text' }, { key: 'competitorHighlights', label: 'Competitor highlights', type: 'text' }],
};
const CHANNEL: Record<string, string> = { GROSIR: 'WHOLESALER', HORECA: 'HORECA', REGULER: 'REGULAR' };

export function ReportsScreen() {
  const { boot, state } = useField(); const online = useOnline();
  const cat = boot?.spg.category ?? 'REGULER';
  const [v, setV] = useState<Record<string, string>>({ outletsVisited: String(state.visitedToday.length), wholesalersVisited: String(state.visitedToday.length) });
  const [summary, setSummary] = useState(''); const [issues, setIssues] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const history = useQuery({ queryKey: ['my-reports'], queryFn: () => apiPage<{ id: string; reportDate: string; status: string; isLate: boolean; submittedAt: string | null; completenessScore: string | null; reviewNote: string | null }>('/daily-reports', { query: { mine: 'true', pageSize: 14 } }), enabled: online });
  const submit = async () => {
    const content = Object.fromEntries(FIELDS[cat].map((f) => [f.key, f.type === 'int' ? Number(v[f.key] || 0) : v[f.key] || null]));
    const body = { clientId: newId(), clientRecordedAt: new Date().toISOString(), channel: CHANNEL[cat], reportDate: jakartaDate(), summary: summary || null, issues: issues || null, content, submit: true };
    const r = validatePayload(dailyReportSchema, body);
    if (!r.ok) { setErrors(r.errors); return; }
    await enqueue({ id: body.clientId, label: `Daily report ${body.reportDate}`, kind: 'json', method: 'POST', path: '/daily-reports', body });
    setDone(true);
  };
  return <div className="space-y-3">
    <Card className="space-y-3">
      <h1 className="text-base font-semibold">Daily report · {jakartaDate()}</h1>
      {done ? <p className="text-sm text-good-text">Report saved – it syncs automatically. A report submitted after the deadline is marked late.</p> : <>
        {FIELDS[cat].map((f) => <MField key={f.key} label={f.label} error={errors[`content.${f.key}`]}>
          {f.type === 'int' ? <input inputMode="numeric" className={mInput} value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value.replace(/\D/g, '') })} />
            : <textarea className={`${mInput} h-16 py-2`} value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}</MField>)}
        <MField label="Summary of the day"><textarea className={`${mInput} h-20 py-2`} value={summary} onChange={(e) => setSummary(e.target.value)} /></MField>
        <MField label="Issues / support needed"><textarea className={`${mInput} h-16 py-2`} value={issues} onChange={(e) => setIssues(e.target.value)} /></MField>
        <MButton onClick={submit}>Submit report</MButton></>}
    </Card>
    <Card><h2 className="mb-2 text-sm font-semibold">Recent reports</h2>
      {!online ? <p className="text-sm text-ink-muted">History is available when online.</p> : <ul className="divide-y divide-border">{(history.data?.data ?? []).map((r) => <li key={r.id} className="py-2 text-sm">
        <div className="flex items-center justify-between"><span>{fmtDate(r.reportDate)}</span><span className="flex gap-1">{r.isLate && <StatusBadge status="WARNING" label="Late" />}<StatusBadge status={r.status} /></span></div>
        <div className="text-xs text-ink-muted">Submitted {fmtDateTime(r.submittedAt)} · completeness {r.completenessScore ?? '–'}%</div>
        {r.reviewNote && <div className="mt-1 rounded bg-warn-soft px-2 py-1 text-xs text-warn-text">Supervisor: {r.reviewNote}</div>}</li>)}</ul>}
    </Card>
  </div>;
}

'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PERMISSIONS } from '@tanda/shared';
import { Button } from './ui/button';
import { useToast } from './ui/toast';

/** Exports always pass the exact on-screen filter to the server (brief §M). */
export function ExportMenu({ report, filters }: { report: string; filters: Record<string, unknown> }) {
  const { can } = useAuth(); const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!can(PERMISSIONS.REPORT_EXPORT)) return null;
  const run = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setBusy(format);
    try { await download(`/reports/${report}/export`, { ...filters, format }); toast('success', `Export ${format.toUpperCase()} ready`); }
    catch (e) { toast('error', (e as Error).message); } finally { setBusy(null); }
  };
  return <div className="flex items-center gap-1">
    {(['xlsx', 'csv', 'pdf'] as const).map((f) => <Button key={f} variant="secondary" size="sm" loading={busy === f} onClick={() => run(f)} aria-label={`Export ${f.toUpperCase()}`}><Download className="h-3.5 w-3.5" />{f.toUpperCase()}</Button>)}
  </div>;
}

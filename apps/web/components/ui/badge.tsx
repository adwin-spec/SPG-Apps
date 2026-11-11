import { CheckCircle2, AlertTriangle, AlertOctagon, CircleDot, MinusCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { humanize } from '@/lib/format';

type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'serious' | 'critical';
const tones: Record<Tone, string> = {
  neutral: 'bg-black/[.05] text-ink-secondary border-line',
  info: 'bg-black/[.05] text-ink border-line',
  good: 'bg-good-soft text-good-text border-good/30',
  warn: 'bg-warn-soft text-warn-text border-warn/30',
  serious: 'bg-warn-soft text-warn-text border-warn/30',
  critical: 'bg-critical-soft text-critical-text border-critical/30',
};
const icons: Partial<Record<Tone, React.ElementType>> = { good: CheckCircle2, warn: AlertTriangle, serious: AlertTriangle, critical: AlertOctagon, info: CircleDot, neutral: MinusCircle };

export function Badge({ tone = 'neutral', children, icon = false, className }: { tone?: Tone; children: React.ReactNode; icon?: boolean; className?: string }) {
  const Icon = icons[tone];
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-semibold', tones[tone], className)}>
    {icon && Icon && <Icon className="h-3 w-3" aria-hidden />}{children}</span>;
}

/** Status always ships with icon + label (status color never carries meaning alone). */
const STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'good', VALIDATED: 'info', SUBMITTED: 'neutral', NEEDS_REVIEW: 'warn', REJECTED: 'critical', SUPERSEDED: 'neutral', REVERSED: 'serious',
  ACTIVE: 'good', INACTIVE: 'neutral', PROSPECT: 'info', CLOSED: 'critical', RESIGNED: 'neutral', ON_LEAVE: 'warn',
  GOOD: 'good', WATCH: 'warn', CRITICAL: 'critical',
  INSIDE: 'good', OUTSIDE: 'critical', UNKNOWN: 'warn',
  COMPLETED: 'good', IN_PROGRESS: 'info', CANCELLED: 'neutral',
  PLANNED: 'info', VISITED: 'good', MISSED: 'critical',
  DRAFT: 'neutral', REVISION_REQUIRED: 'warn',
  UPLOADED: 'neutral', PROCESSING: 'info', OCR_COMPLETED: 'info', SYNC_FAILED: 'critical',
  PENDING: 'warn', SUCCEEDED: 'good', FAILED: 'critical', RUNNING: 'info', QUEUED: 'neutral',
  EXACT_DUPLICATE: 'critical', POTENTIAL_DUPLICATE: 'warn', RE_UPLOAD: 'warn', CORRECTED_SUBMISSION: 'info',
  OK: 'good', NO_DATA: 'neutral', NO_TARGET: 'neutral', ZERO_TARGET: 'warn',
  OPEN: 'warn', RESOLVED: 'good', IGNORED: 'neutral', INFO: 'info', WARNING: 'warn',
  CHECKED_IN: 'info', CHECKED_OUT: 'good', ABSENT: 'critical', LEAVE: 'neutral',
  IN_STOCK: 'good', LOW_STOCK: 'warn', OUT_OF_STOCK: 'critical', INSTALLED: 'good', MISSING: 'critical', DAMAGED: 'serious',
  EXECUTED: 'good', PARTIAL: 'warn', NOT_EXECUTED: 'critical',
};
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-ink-muted">–</span>;
  const tone = STATUS_TONE[status] ?? 'neutral';
  return <Badge tone={tone} icon>{label ?? humanize(status)}</Badge>;
}
export { Clock };

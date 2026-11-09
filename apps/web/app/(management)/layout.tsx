import { Suspense } from 'react';
import { ManagementShell } from '@/components/shell';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ManagementShell><Suspense fallback={<div className="text-sm text-ink-muted">Loading…</div>}>{children}</Suspense></ManagementShell>;
}

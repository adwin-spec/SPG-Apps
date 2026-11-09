import { Suspense } from 'react';
import { MobileShell } from '@/features/mobile/shell';
export default function Layout({ children }: { children: React.ReactNode }) { return <Suspense><MobileShell>{children}</MobileShell></Suspense>; }

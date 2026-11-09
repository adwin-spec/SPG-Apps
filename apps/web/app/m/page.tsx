'use client';
import { Suspense } from 'react';
import { useScreen } from '@/features/mobile/nav';
import { TodayScreen } from '@/features/mobile/screens/today';
import { OutletsScreen } from '@/features/mobile/screens/outlets';
import { VisitScreen } from '@/features/mobile/screens/visit';
import { ReportsScreen } from '@/features/mobile/screens/reports';
import { PerformanceScreen } from '@/features/mobile/screens/performance';
import { SyncScreen } from '@/features/mobile/screens/sync';

function Screens() {
  const { screen } = useScreen();
  switch (screen) {
    case 'outlets': return <OutletsScreen />;
    case 'visit': return <VisitScreen />;
    case 'reports': return <ReportsScreen />;
    case 'performance': return <PerformanceScreen />;
    case 'sync': return <SyncScreen />;
    default: return <TodayScreen />;
  }
}
export default function SpgApp() { return <Suspense><Screens /></Suspense>; }

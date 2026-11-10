import { LayoutDashboard, ClipboardCheck, Users, MapPinned, Settings, ScrollText } from 'lucide-react';
import type { Role } from './types';

export interface NavItem { label: string; href: string; icon: React.ElementType; roles: Role[] }
export const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'SPV'] },
  { label: 'Persetujuan', href: '/review', icon: ClipboardCheck, roles: ['ADMIN', 'SPV'] },
  { label: 'SPG & Supervisor', href: '/users', icon: Users, roles: ['ADMIN', 'SPV'] },
  { label: 'Wilayah', href: '/wilayah', icon: MapPinned, roles: ['ADMIN'] },
  { label: 'Pengaturan', href: '/settings', icon: Settings, roles: ['ADMIN'] },
  { label: 'Log audit', href: '/audit', icon: ScrollText, roles: ['ADMIN'] },
];

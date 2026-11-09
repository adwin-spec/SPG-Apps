import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'Tanda Tambah – SPG Performance & Market Intelligence', template: '%s · Tanda Tambah' },
  description: 'Field force management, SPG performance, and market intelligence',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'TT SPG', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#0f1e3d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body><Providers>{children}</Providers></body></html>;
}

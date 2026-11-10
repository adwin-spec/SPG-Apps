import type { Metadata, Viewport } from 'next';
import { Permanent_Marker, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';

/** Huruf: Space Grotesk untuk semua teks & angka; Permanent Marker (gaya spidol) hanya untuk judul. */
const sans = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-marker', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tanda Tambah – SPG', template: '%s · Tanda Tambah' },
  description: 'Laporan SPG Grosir, Reguler & survei HORECA Tanda Tambah',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Tanda Tambah', statusBarStyle: 'black' },
};
export const viewport: Viewport = { themeColor: '#141210', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id" className={`${sans.variable} ${marker.variable}`}><body><Providers>{children}</Providers></body></html>;
}

import type { Metadata, Viewport } from 'next';
import { Inter, Permanent_Marker } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';

/** Huruf: Inter untuk semua konten, angka, tabel, form, navigasi. Permanent Marker HANYA untuk teks latar & sorotan dekoratif. */
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-marker', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tanda Tambah – SPG', template: '%s · Tanda Tambah' },
  description: 'Laporan SPG Grosir, Reguler & survei HORECA Tanda Tambah',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Tanda Tambah', statusBarStyle: 'black' },
};
export const viewport: Viewport = { themeColor: '#111111', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id" className={`${sans.variable} ${marker.variable}`}><body><Providers>{children}</Providers></body></html>;
}

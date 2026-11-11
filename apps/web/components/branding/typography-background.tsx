/** Teks latar ekspresif: kata-kata tulisan tangan berukuran besar, diputar, bertumpuk, terpotong di tepi layar.
 *  Selalu di belakang konten (pointer-events: none, aria-hidden) dan sangat samar agar data tetap terbaca. */
import { cn } from '@/lib/utils';

export type BgPreset = 'login' | 'dashboard' | 'grosir' | 'horeca' | 'reguler' | 'review' | 'people' | 'data' | 'field' | 'mobile';
export const BG_WORDS: Record<BgPreset, [string, string, string, string, string]> = {
  login: ['TANDA TAMBAH', 'MORE', 'GROWTH', 'AKSI', 'IMPACT'],
  dashboard: ['GROWTH', 'PERFORMANCE', 'IMPACT', 'HASIL', 'INSIGHT'],
  grosir: ['MARKET', 'MOVEMENT', 'PASAR', 'GROWTH', 'TRANSAKSI'],
  horeca: ['CONNECT', 'DISCOVER', 'EXPERIENCE', 'PEOPLE', 'INSIGHT'],
  reguler: ['FIELD', 'GERAK', 'MOVEMENT', 'PASAR', 'EXECUTE'],
  review: ['ACTION', 'EXECUTE', 'AKSI', 'PROGRESS', 'OBSERVE'],
  people: ['PEOPLE', 'PROGRESS', 'KINERJA', 'CONNECT', 'TUMBUH'],
  data: ['DATA', 'MEASURE', 'INFORMASI', 'INSIGHT', 'PERUBAHAN'],
  field: ['FIELD', 'PASAR', 'GERAK', 'DISCOVER', 'OBSERVE'],
  mobile: ['AKSI', 'GERAK', 'MORE', 'FIELD', 'TUMBUH'],
};
// Posisi editorial tetap (bukan pola berulang). Slot 4–5 hanya tampil di layar lebar; slot 3 dari tablet.
const SLOTS = [
  { cls: '-left-[4vw] top-[6vh] text-[19vw] lg:text-[15vw]', rot: -7, op: 0.05, show: '' },
  { cls: '-right-[6vw] top-[38vh] text-[13vw] lg:text-[11vw]', rot: 6, op: 0.045, show: '' },
  { cls: 'left-[18vw] bottom-[2vh] text-[11vw] lg:text-[8vw]', rot: -3, op: 0.05, show: 'hidden md:block' },
  { cls: 'right-[22vw] top-[2vh] text-[5vw]', rot: 9, op: 0.06, show: 'hidden lg:block' },
  { cls: '-left-[2vw] bottom-[24vh] text-[6vw]', rot: -14, op: 0.045, show: 'hidden lg:block' },
];

export function TypographyBackground({ preset, className, density = 'full' }: { preset: BgPreset; className?: string; density?: 'full' | 'light' }) {
  const words = BG_WORDS[preset];
  return <div aria-hidden className={cn('bg-layer pointer-events-none fixed inset-0 z-0 overflow-hidden', className)}>
    {SLOTS.slice(0, density === 'light' ? 2 : 5).map((s, i) => <span key={i} className={cn('bg-word', s.cls, s.show)}
      style={{ opacity: s.op, ['--rot' as string]: `${s.rot}deg`, transform: `rotate(${s.rot}deg)`, animation: i < 2 ? `tt-drift ${60 + i * 20}s ease-in-out infinite alternate` : undefined }}>{words[i]}</span>)}
  </div>;
}

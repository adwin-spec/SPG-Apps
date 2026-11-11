'use client';
/** Peta lokasi laporan / kunjungan outlet. Titik berasal dari backend dan SUDAH mengikuti filter dashboard,
 *  jadi setiap filter berubah, peta ikut berubah. Klik titik → detail + tombol "Saring ke kecamatan ini". */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { EmptyState } from '@/components/ui/empty-state';

export interface MapPoint { lat: number; lon: number; label: string; sub: string; tone: 'tt' | 'ink'; kec?: { kode: string; nama: string; kabKode: string; provKode: string } | null }
const COLOR = { tt: '#d94a43', ink: '#111111' };

export function PointsMap({ points, onPickKec }: { points: MapPoint[]; onPickKec: (k: NonNullable<MapPoint['kec']>) => void }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const layer = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null); const pick = useRef(onPickKec); pick.current = onPickKec;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let off = false;
    import('leaflet').then((mod) => {
      if (off || !el.current || map.current) return;
      const Lf = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L); lib.current = Lf;
      // Animasi zoom dimatikan: peta berganti setiap filter berubah, dan animasi yang terpotong saat panel dilepas memicu error Leaflet.
      const m = Lf.map(el.current, { preferCanvas: true, zoomControl: true, scrollWheelZoom: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([-7.3, 110.0], 7);
      Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      m.on('focus', () => m.scrollWheelZoom.enable()); m.on('blur', () => m.scrollWheelZoom.disable());
      layer.current = Lf.layerGroup().addTo(m); map.current = m; setReady(true);
    });
    return () => { off = true; const m = map.current; map.current = null; layer.current = null; if (m) { m.stop(); m.off(); m.remove(); } };
  }, []);

  useEffect(() => {
    const Lf = lib.current, m = map.current, g = layer.current;
    if (!ready || !Lf || !m || !g) return;
    g.clearLayers();
    const renderer = Lf.canvas({ padding: 0.5 });
    points.forEach((p) => {
      const mk = Lf.circleMarker([p.lat, p.lon], { renderer, radius: 6, color: '#ffffff', weight: 2, fillColor: COLOR[p.tone], fillOpacity: 0.9 });
      // Isi popup dibuat dengan textContent (aman dari teks yang diketik pengguna).
      const box = document.createElement('div'); box.className = 'grid gap-1 text-[13px]';
      const t = document.createElement('b'); t.textContent = p.label; const s = document.createElement('span'); s.className = 'text-[#6e6e6e]'; s.textContent = p.sub;
      box.append(t, s);
      if (p.kec) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mt-1 rounded-[9px] bg-[#111] px-2.5 py-1.5 text-xs font-semibold text-white';
        b.textContent = `Saring ke Kec. ${p.kec.nama}`; const k = p.kec; b.onclick = () => { m.closePopup(); pick.current(k); }; box.append(b); }
      mk.bindPopup(box, { closeButton: true }).addTo(g);
    });
    if (points.length === 1) m.setView([points[0].lat, points[0].lon], 14, { animate: false });
    else if (points.length > 1) m.fitBounds(Lf.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [28, 28], maxZoom: 14, animate: false });
  }, [points, ready]);

  return <div className="relative">
    <div ref={el} className="tt-map h-[420px] w-full overflow-hidden rounded-glass-md border border-line" role="region" aria-label="Peta lokasi" tabIndex={0} />
    {!points.length && <div className="absolute inset-0 grid place-items-center rounded-glass-md bg-white/70 backdrop-blur-sm"><EmptyState compact title="Belum ada titik lokasi" hint="Titik muncul dari laporan yang disetujui dan punya lokasi GPS." /></div>}
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#d94a43] ring-2 ring-white" />Ada pembelian / order Tanda Tambah</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#111] ring-2 ring-white" />Tidak ada pembelian</span>
      <span className="text-ink-muted">Klik titik untuk detail · klik peta dulu lalu gulir untuk zoom</span>
    </div>
  </div>;
}

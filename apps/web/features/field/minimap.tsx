'use client';
/** Peta kecil di form SPG: menunjukkan titik lokasi yang tercatat + lingkaran akurasinya.
 *  Sengaja tidak bisa digeser dengan satu jari agar tidak mengganggu scroll form di HP. */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type * as L from 'leaflet';
import type { Gps } from './engine';

export function MiniMap({ g }: { g: Gps }) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<{ Lf: typeof L; m: L.Map; dot: L.CircleMarker; ring: L.Circle } | null>(null);

  useEffect(() => {
    let off = false;
    import('leaflet').then((mod) => {
      if (off || !el.current || st.current) return;
      const Lf = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L);
      const m = Lf.map(el.current, { zoomControl: true, attributionControl: true, dragging: false, scrollWheelZoom: false, touchZoom: true, doubleClickZoom: true,
        boxZoom: false, keyboard: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([g.lat, g.lon], 16);
      Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      const ring = Lf.circle([g.lat, g.lon], { radius: g.acc ?? 0, color: '#d94a43', weight: 1, fillColor: '#d94a43', fillOpacity: 0.12, interactive: false }).addTo(m);
      const dot = Lf.circleMarker([g.lat, g.lon], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#d94a43', fillOpacity: 1, interactive: false }).addTo(m);
      st.current = { Lf, m, dot, ring };
    });
    return () => { off = true; const s = st.current; st.current = null; if (s) { s.m.stop(); s.m.off(); s.m.remove(); } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = st.current; if (!s) return;
    s.dot.setLatLng([g.lat, g.lon]); s.ring.setLatLng([g.lat, g.lon]).setRadius(g.acc ?? 0);
    // Akurasi buruk → perkecil zoom supaya lingkarannya terlihat utuh.
    s.m.setView([g.lat, g.lon], (g.acc ?? 0) > 300 ? 14 : 16, { animate: false });
  }, [g.lat, g.lon, g.acc]);

  return <div ref={el} className="tt-map tt-minimap h-40 w-full overflow-hidden rounded-glass-sm border border-line" role="img"
    aria-label={`Peta lokasi ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}`} data-minimap />;
}

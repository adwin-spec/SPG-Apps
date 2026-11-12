/* Tanda Tambah SPG – service worker.
 * App shell & static assets: stale-while-revalidate so the SPG app opens offline.
 * API calls are NEVER cached here: business data lives in IndexedDB and writes go through the outbox. */
const SHELL = 'tt-shell-v2';
const PRECACHE = ['/m', '/login', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Halaman: ambil dari server dulu agar pembaruan aplikasi langsung terlihat; cache hanya cadangan saat tidak ada sinyal.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone())); return res; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('/m')) || Response.error()));
    return;
  }
  // File /_next/static bernama unik per versi → aman diambil dari cache. Lainnya: tampilkan cache, perbarui di belakang.
  e.respondWith(caches.open(SHELL).then(async (cache) => {
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => { if (res.ok && (url.pathname.startsWith('/_next/static') || PRECACHE.includes(url.pathname))) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});

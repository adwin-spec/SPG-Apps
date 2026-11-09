/* Tanda Tambah SPG – service worker.
 * App shell & static assets: stale-while-revalidate so the SPG app opens offline.
 * API calls are NEVER cached here: business data lives in IndexedDB and writes go through the outbox. */
const SHELL = 'tt-shell-v1';
const PRECACHE = ['/m', '/login', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(SHELL).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    const network = fetch(e.request).then((res) => { if (res.ok && (url.pathname.startsWith('/_next/static') || e.request.mode === 'navigate' || PRECACHE.includes(url.pathname))) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});

#!/usr/bin/env node
/**
 * Lightweight API performance test (no external tooling). Fires N concurrent virtual users at the
 * heaviest read endpoints and reports throughput and latency percentiles.
 *   node infrastructure/scripts/perf-test.mjs [baseUrl] [concurrency] [requestsPerEndpoint]
 * Uses demo credentials – run against development/staging only.
 */
const BASE = process.argv[2] ?? 'http://localhost:4000/api/v1';
const C = Number(process.argv[3] ?? 20);
const N = Number(process.argv[4] ?? 200);
const login = async (email) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: process.env.DEMO_PASSWORD ?? 'Demo12345!' }) })).json()).data.accessToken;
const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const nat = await login('national@demo.tanda-tambah.local');
const spg = await login('demo-spg-001@demo.tanda-tambah.local');
const endpoints = [
  ['Executive dashboard (30d)', `/analytics/executive?from=${from}`, nat],
  ['Market intelligence (30d)', `/analytics/market?from=${from}`, nat],
  ['Drill-down by area', `/analytics/drilldown?level=area&from=${from}`, nat],
  ['Transactions list (page 1)', '/retailer-transactions?pageSize=50', nat],
  ['Performance ranking', `/performance?period=${from.slice(0, 7)}&pageSize=50`, nat],
  ['SPG field bootstrap', '/field/bootstrap', spg],
];
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
console.log(`Concurrency ${C}, ${N} requests per endpoint → ${BASE}\n`);
console.log('Endpoint'.padEnd(30), 'req/s'.padStart(7), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'p99 ms'.padStart(8), 'errors'.padStart(7));
let failed = false;
for (const [name, path, tok] of endpoints) {
  const lat = []; let errors = 0; let next = 0; const t0 = performance.now();
  await Promise.all(Array.from({ length: C }, async () => {
    while (next < N) { next++; const s = performance.now();
      try { const r = await fetch(BASE + path, { headers: { authorization: `Bearer ${tok}` } }); await r.arrayBuffer(); if (!r.ok) errors++; } catch { errors++; }
      lat.push(performance.now() - s); }
  }));
  const secs = (performance.now() - t0) / 1000; lat.sort((a, b) => a - b);
  const p95 = pct(lat, 95); if (errors || p95 > 2000) failed = true;
  console.log(name.padEnd(30), (N / secs).toFixed(1).padStart(7), pct(lat, 50).toFixed(0).padStart(8), p95.toFixed(0).padStart(8), pct(lat, 99).toFixed(0).padStart(8), String(errors).padStart(7));
}
console.log(failed ? '\nFAIL: errors or p95 > 2000 ms' : '\nPASS: no errors, p95 ≤ 2000 ms');
process.exit(failed ? 1 : 0);

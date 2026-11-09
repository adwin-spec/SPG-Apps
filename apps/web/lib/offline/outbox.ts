'use client';
import { apiRaw } from '../api';
import { db, type OutboxOp } from './db';

/**
 * Offline-first outbox (brief §H):
 *  1. every write is stored locally with a client UUID and Idempotency-Key,
 *  2. synced in creation order when online (automatic + manual),
 *  3. server replays never create duplicates (client_id unique + idempotency keys),
 *  4. 409 conflicts are surfaced to the user – never silently overwritten,
 *  5. records created offline can reference each other via `client:<uuid>` placeholders
 *     that are resolved to server ids at sync time.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export const onOutboxChange = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
const emit = () => listeners.forEach((l) => l());

export const newId = () => crypto.randomUUID();
export const clientRef = (clientId: string) => `client:${clientId}`;
export const fileRef = (key: string) => `file:${key}`;

export async function enqueue(op: Omit<OutboxOp, 'status' | 'attempts' | 'createdAt' | 'id'> & { id?: string }) {
  const full: OutboxOp = { ...op, id: op.id ?? newId(), status: 'pending', attempts: 0, createdAt: Date.now() };
  await (await db()).put('outbox', full);
  emit();
  void syncNow();
  return full.id;
}

export async function stagePhoto(blob: Blob, name: string) {
  const key = newId();
  await (await db()).put('files', { key, blob, name, createdAt: Date.now() });
  await enqueue({ label: `Photo ${name}`, kind: 'upload', method: 'POST', path: '/files?purpose=evidence', fileKey: key, mapAs: key, id: key });
  return key;
}

export async function listOps() { return (await db()).getAllFromIndex('outbox', 'byCreated'); }
export async function pendingCount() { return (await listOps()).length; }
export async function discard(id: string) { const d = await db(); const op = await d.get('outbox', id); if (op?.fileKey) await d.delete('files', op.fileKey); await d.delete('outbox', id); emit(); }
export async function retry(id: string) { const d = await db(); const op = await d.get('outbox', id); if (op) { await d.put('outbox', { ...op, status: 'pending', nextAttemptAt: 0, error: undefined }); emit(); void syncNow(); } }
export async function serverIdFor(clientId: string) { return (await (await db()).get('idmap', clientId))?.serverId ?? null; }

async function resolve(value: unknown): Promise<{ value: unknown; missing: string | null }> {
  const d = await db(); let missing: string | null = null;
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string') {
      const m = v.match(/(client|file):([0-9a-f-]{36})/);
      if (!m) return v;
      const mapped = (await d.get('idmap', m[2]))?.serverId;
      if (!mapped) { missing = m[2]; return v; }
      return v.replace(m[0], mapped);
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') return Object.fromEntries(await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x)])));
    return v;
  };
  return { value: await walk(value), missing };
}

let running: Promise<void> | null = null;
export function syncNow() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run() {
  const d = await db();
  for (const op of await d.getAllFromIndex('outbox', 'byCreated')) {
    if (op.status === 'failed' || op.status === 'conflict') continue;     // needs a human decision
    if (op.nextAttemptAt && op.nextAttemptAt > Date.now()) break;          // keep order: wait for backoff
    const path = await resolve(op.path); const body = await resolve(op.body);
    if (path.missing || body.missing) break;                                // dependency not synced yet
    await d.put('outbox', { ...op, status: 'syncing' }); emit();
    let res: Response;
    try {
      if (op.kind === 'upload') {
        const f = await d.get('files', op.fileKey!);
        if (!f) { await d.delete('outbox', op.id); continue; }
        const fd = new FormData(); fd.append('file', f.blob, f.name);
        res = await apiRaw(path.value as string, { method: 'POST', body: fd, idempotencyKey: op.id });
      } else {
        res = await apiRaw(path.value as string, { method: op.method, body: body.value, idempotencyKey: op.id });
      }
    } catch (e) {
      await d.put('outbox', { ...op, status: 'pending', attempts: op.attempts + 1, error: 'Offline – will retry', nextAttemptAt: Date.now() + Math.min(60_000, 2_000 * 2 ** op.attempts) });
      emit(); break;
    }
    const json = await res.json().catch(() => null);
    if (res.ok) {
      const serverId = json?.data?.id as string | undefined;
      if (op.mapAs && serverId) await d.put('idmap', { clientId: op.mapAs, serverId });
      if (op.fileKey) await d.delete('files', op.fileKey);
      await d.delete('outbox', op.id);
    } else if (res.status === 409) {
      // Business conflict (e.g. already checked in, visit already open, report locked): never overwrite silently.
      // An exact replay of the same record is idempotent server-side and returns 2xx, so 409 means a real conflict.
      await d.put('outbox', { ...op, status: 'conflict', attempts: op.attempts + 1, error: json?.error?.message ?? 'Conflict', details: json?.error?.details });
    } else if (res.status >= 500 || res.status === 429 || res.status === 401) {
      await d.put('outbox', { ...op, status: 'pending', attempts: op.attempts + 1, error: json?.error?.message ?? `HTTP ${res.status}`, nextAttemptAt: Date.now() + Math.min(300_000, 5_000 * 2 ** op.attempts) });
      emit(); break;
    } else {
      await d.put('outbox', { ...op, status: 'failed', attempts: op.attempts + 1, error: json?.error?.message ?? `HTTP ${res.status}`, details: json?.error?.details });
    }
    emit();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncNow());
  setInterval(() => void syncNow(), 30_000);
}

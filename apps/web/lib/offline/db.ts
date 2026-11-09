'use client';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type OpStatus = 'pending' | 'syncing' | 'failed' | 'conflict';
export interface OutboxOp {
  id: string;                 // = Idempotency-Key (client-generated UUID)
  label: string;              // human description shown in the Sync Center
  kind: 'json' | 'upload';
  method: 'POST' | 'PUT' | 'PATCH';
  path: string;               // may contain placeholders: client:<uuid> / file:<uuid>
  body?: unknown;             // may contain placeholders
  fileKey?: string;           // for uploads: key into `files`
  /** For uploads/creates: register server id under this client id once synced */
  mapAs?: string;
  status: OpStatus;
  attempts: number;
  error?: string;
  details?: unknown;
  createdAt: number;
  nextAttemptAt?: number;
}
interface Schema extends DBSchema {
  outbox: { key: string; value: OutboxOp; indexes: { byCreated: number } };
  files: { key: string; value: { key: string; blob: Blob; name: string; createdAt: number } };
  idmap: { key: string; value: { clientId: string; serverId: string } };
  cache: { key: string; value: { key: string; value: unknown; savedAt: number } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db() {
  dbp ??= openDB<Schema>('tt-spg', 1, {
    upgrade(d) {
      d.createObjectStore('outbox', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
      d.createObjectStore('files', { keyPath: 'key' });
      d.createObjectStore('idmap', { keyPath: 'clientId' });
      d.createObjectStore('cache', { keyPath: 'key' });
    },
  });
  return dbp;
}

export async function cacheSet(key: string, value: unknown) { (await db()).put('cache', { key, value, savedAt: Date.now() }); }
export async function cacheGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const r = await (await db()).get('cache', key);
  return r ? { value: r.value as T, savedAt: r.savedAt } : null;
}
export async function clearAll() {
  const d = await db();
  await Promise.all([d.clear('cache'), d.clear('idmap')]);
}

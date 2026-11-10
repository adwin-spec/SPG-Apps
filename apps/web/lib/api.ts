'use client';
import type { AuthUser, PageMeta } from './types';

/** Access token lives in memory only (never localStorage – ADR D10). */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onUnauthenticated: (() => void) | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const setUnauthenticatedHandler = (fn: () => void) => { onUnauthenticated = fn; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export async function refreshSession(): Promise<{ accessToken: string; user: AuthUser } | null> {
  const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!r.ok) return null;
  const j = await r.json();
  accessToken = j.data.accessToken;
  return j.data;
}

async function tryRefresh(): Promise<boolean> {
  refreshing ??= refreshSession().then((r) => !!r).finally(() => setTimeout(() => { refreshing = null; }, 0));
  return refreshing;
}

export interface RequestOptions { method?: string; body?: unknown; query?: Record<string, unknown>; idempotencyKey?: string; raw?: boolean; signal?: AbortSignal }

export function qs(query?: Record<string, unknown>) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function apiRaw(path: string, opts: RequestOptions = {}, retried = false): Promise<Response> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined && !isForm) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  const res = await fetch(`/api/v1${path}${qs(opts.query)}`, {
    method: opts.method ?? 'GET', headers, credentials: 'same-origin', signal: opts.signal,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return apiRaw(path, opts, true);
    onUnauthenticated?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<{ data: T; meta?: PageMeta }> {
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, j?.error?.code ?? 'HTTP_ERROR', j?.error?.message ?? res.statusText, j?.error?.details);
  return j;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await parse<T>(await apiRaw(path, opts))).data;
}
export async function apiPage<T = unknown>(path: string, opts: RequestOptions = {}): Promise<{ data: T[]; meta: PageMeta }> {
  const r = await parse<T[]>(await apiRaw(path, opts));
  return { data: r.data, meta: r.meta ?? { page: 1, pageSize: r.data.length, total: r.data.length, totalPages: 1 } };
}

/** Authenticated download (exports, evidence) – the token is never put in a URL. */
export async function download(path: string, query?: Record<string, unknown>) {
  const res = await apiRaw(path, { query });
  if (!res.ok) { const j = await res.json().catch(() => null); throw new ApiError(res.status, j?.error?.code ?? 'HTTP_ERROR', j?.error?.message ?? 'Download failed'); }
  const blob = await res.blob();
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'download';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function blobUrl(path: string) {
  const res = await apiRaw(path);
  if (!res.ok) throw new ApiError(res.status, 'HTTP_ERROR', 'Could not load file');
  return URL.createObjectURL(await res.blob());
}

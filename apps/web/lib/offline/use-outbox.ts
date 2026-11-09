'use client';
import { useEffect, useState } from 'react';
import { listOps, onOutboxChange } from './outbox';
import type { OutboxOp } from './db';

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export function useOutbox() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  useEffect(() => { const load = () => void listOps().then(setOps); load(); const off = onOutboxChange(load); const t = setInterval(load, 5000); return () => { off(); clearInterval(t); }; }, []);
  return { ops, pending: ops.filter((o) => o.status === 'pending' || o.status === 'syncing').length, problems: ops.filter((o) => o.status === 'failed' || o.status === 'conflict').length };
}

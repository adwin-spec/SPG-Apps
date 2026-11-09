import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';

/** Thin cache wrapper. Cache failures never break requests (fail-open to the database). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  readonly client: Redis;
  constructor() {
    this.client = new Redis(env().REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: true });
    this.client.on('error', (e) => this.log.warn(`Redis error: ${e.message}`));
  }
  async getJson<T>(key: string): Promise<T | null> {
    try { const v = await this.client.get(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  }
  async setJson(key: string, value: unknown, ttlSeconds: number) {
    try { await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch { /* fail-open */ }
  }
  async del(...keys: string[]) { try { if (keys.length) await this.client.del(...keys); } catch { /* ignore */ } }
  async delPattern(pattern: string) {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch { /* ignore */ }
  }
  async onModuleDestroy() { await this.client.quit().catch(() => undefined); }
}

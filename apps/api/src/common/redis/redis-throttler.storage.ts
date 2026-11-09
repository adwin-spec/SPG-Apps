import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

/** Redis-backed rate-limit storage so limits hold across multiple API instances. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}
  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const k = `rl:${throttlerName}:${key}`;
    const bk = `${k}:blocked`;
    const c = this.redis.client;
    try {
      const blockedTtl = await c.pttl(bk);
      if (blockedTtl > 0) return { totalHits: limit + 1, timeToExpire: Math.ceil(blockedTtl / 1000), isBlocked: true, timeToBlockExpire: Math.ceil(blockedTtl / 1000) };
      const [[, hits], [, pttl]] = (await c.multi().incr(k).pttl(k).exec()) as [[null, number], [null, number]];
      if (pttl < 0) await c.pexpire(k, ttl);
      const isBlocked = hits > limit;
      if (isBlocked) await c.set(bk, '1', 'PX', blockDuration);
      return { totalHits: hits, timeToExpire: Math.ceil((pttl < 0 ? ttl : pttl) / 1000), isBlocked, timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0 };
    } catch {
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}

import { Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS } from '@tanda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Reads configurable business rules from `system_settings` (cached 60 s). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T> {
    const cacheKey = `setting:${key}`;
    const cached = await this.redis.getJson<{ v: T }>(cacheKey);
    if (cached) return cached.v;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const fallback = DEFAULT_SETTINGS.find((s) => s.key === key)?.value as T | undefined;
    const value = (row?.value as T) ?? fallback;
    if (value === undefined) throw new Error(`Unknown setting ${key}`);
    await this.redis.setJson(cacheKey, { v: value }, 60);
    return value;
  }

  async invalidate(key: string) { await this.redis.del(`setting:${key}`); }
}

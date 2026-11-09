import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Public() @Get('live')
  live() { return { status: 'ok' }; }

  @Public() @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};
    try { await this.prisma.$queryRaw`SELECT 1`; checks.database = 'ok'; } catch { checks.database = 'down'; }
    try { checks.redis = (await this.redis.client.ping()) === 'PONG' ? 'ok' : 'down'; } catch { checks.redis = 'down'; }
    if (checks.database !== 'ok') throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Dependencies unavailable', details: checks });
    return { status: 'ok', checks };
  }
}

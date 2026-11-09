import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@tanda/shared';
import { IS_PUBLIC, PERMS_ANY_KEY, PERMS_KEY } from '../decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Global guard: (1) verifies the access JWT, (2) loads the user (cached 60 s, invalidated on change),
 * rejects inactive/locked users immediately, (3) enforces declared permissions.
 * Endpoints without @Public() and without any permission declaration are DENIED (secure default).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
    let payload: { sub: string; typ?: string };
    try { payload = await this.jwt.verifyAsync(header.slice(7)); } catch {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Access token invalid or expired' });
    }
    if (payload.typ !== 'access') throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Wrong token type' });
    const user = await this.loadUser(payload.sub);
    if (!user) throw new UnauthorizedException({ code: 'USER_INACTIVE', message: 'User is inactive or does not exist' });
    req.user = user;

    const all = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, targets);
    const any = this.reflector.getAllAndOverride<string[]>(PERMS_ANY_KEY, targets);
    if (!all?.length && !any?.length) throw new ForbiddenException({ code: 'NO_PERMISSION_DECLARED', message: 'Endpoint has no permission policy' });
    if (all?.length && !all.every((p) => user.permissions.includes(p))) throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing permission: ${all.filter((p) => !user.permissions.includes(p)).join(', ')}` });
    if (any?.length && !any.some((p) => user.permissions.includes(p))) throw new ForbiddenException({ code: 'FORBIDDEN', message: `Requires one of: ${any.join(', ')}` });
    return true;
  }

  async loadUser(id: string): Promise<AuthUser | null> {
    const key = `auth:user:${id}`;
    const cached = await this.redis.getJson<AuthUser | { inactive: true }>(key);
    if (cached) return 'inactive' in cached ? null : cached;
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, spg: { include: { category: true } }, supervisor: true },
    });
    if (!u || !u.isActive || (u.lockedUntil && u.lockedUntil > new Date())) { await this.redis.setJson(key, { inactive: true }, 30); return null; }
    const user: AuthUser = {
      id: u.id, email: u.email, fullName: u.fullName,
      roles: u.roles.map((r) => r.role.code),
      permissions: [...new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))],
      spgId: u.spg?.status === 'ACTIVE' ? u.spg.id : u.spg ? u.spg.id : null,
      spgCategory: (u.spg?.category.code as AuthUser['spgCategory']) ?? null,
      supervisorId: u.supervisor?.id ?? null, regionId: u.regionId, areaId: u.areaId,
    };
    await this.redis.setJson(key, user, 60);
    return user;
  }
}

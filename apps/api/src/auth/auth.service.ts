import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { env } from '../config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { ScopeService } from '../common/scope/scope.service';
import type { RequestMeta } from '../common/http/request-meta';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Pre-computed hash so unknown e-mails cost the same time as wrong passwords (no user enumeration).
let DUMMY_HASH: Promise<string> | null = null;

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService,
    private readonly guard: AuthGuard, private readonly scope: ScopeService) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = () => new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    if (!user) {
      DUMMY_HASH ??= hashPassword(randomUUID());
      await argon2.verify(await DUMMY_HASH, password).catch(() => false);
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED', message: `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}` });
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } });
      await this.audit.log({ actorId: user.id, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, ...meta });
      throw invalid();
    }
    if (!user.isActive) {
      await this.audit.log({ actorId: user.id, action: 'LOGIN_BLOCKED_INACTIVE', entityType: 'User', entityId: user.id, ...meta });
      throw new UnauthorizedException({ code: 'USER_INACTIVE', message: 'User account is inactive' });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ...meta });
    await this.scope.invalidateUser(user.id);
    return this.issueTokens(user.id, randomUUID(), meta);
  }

  async refresh(rawToken: string | undefined, meta: RequestMeta) {
    if (!rawToken) throw new UnauthorizedException({ code: 'REFRESH_MISSING', message: 'No refresh token' });
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!row) throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'Invalid refresh token' });
    if (row.revokedAt) {
      // Reuse of a rotated token ⇒ likely theft: revoke the whole family.
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: row.userId, action: 'REFRESH_TOKEN_REUSE_DETECTED', entityType: 'User', entityId: row.userId, ...meta });
      throw new UnauthorizedException({ code: 'REFRESH_REUSED', message: 'Session revoked, please log in again' });
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException({ code: 'REFRESH_EXPIRED', message: 'Session expired' });
    const user = await this.guard.loadUser(row.userId);
    if (!user) {
      await this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException({ code: 'USER_INACTIVE', message: 'User account is inactive' });
    }
    const issued = await this.issueTokens(row.userId, row.familyId, meta);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedBy: issued.refreshTokenId } });
    return issued;
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, current: string, next: string, meta: RequestMeta) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(u.passwordHash, current).catch(() => false))) throw new BadRequestException({ code: 'INVALID_PASSWORD', message: 'Current password is incorrect' });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId, ...meta });
  }

  private async issueTokens(userId: string, familyId: string, meta: RequestMeta) {
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' });
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + env().JWT_REFRESH_TTL_DAYS * 86400000);
    const row = await this.prisma.refreshToken.create({ data: { userId, tokenHash: sha256(refreshToken), familyId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ip: meta.ip } });
    const user = await this.guard.loadUser(userId);
    return { accessToken, refreshToken, refreshTokenId: row.id, refreshExpiresAt: expiresAt, user };
  }
}

import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginSchema, changePasswordSchema, PERMISSIONS, type AuthUser, type LoginInput } from '@tanda/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { ApiZodBody, CurrentUser, Public, RequireAnyPermission } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { ReqMeta, type RequestMeta } from '../common/http/request-meta';
import { AuthService } from './auth.service';

export const REFRESH_COOKIE = 'tt_rt';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(REFRESH_COOKIE, token, { httpOnly: true, secure: env().COOKIE_SECURE, sameSite: 'strict', path: '/api/v1/auth', expires });
  }

  @Public()
  @Throttle({ default: { limit: env().LOGIN_RATE_LIMIT_MAX, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.email, body.password, meta);
    this.setCookie(res, r.refreshToken, r.refreshExpiresAt);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta);
      this.setCookie(res, r.refreshToken, r.refreshExpiresAt);
      return { accessToken: r.accessToken, user: r.user };
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @ApiBearerAuth()
  @RequireAnyPermission(PERMISSIONS.NOTIFICATION_SELF, PERMISSIONS.DASHBOARD_READ)
  @Get('me')
  me(@CurrentUser() user: AuthUser) { return user; }

  @ApiBearerAuth()
  @RequireAnyPermission(PERMISSIONS.NOTIFICATION_SELF, PERMISSIONS.DASHBOARD_READ)
  @Post('change-password')
  @HttpCode(200)
  @ApiZodBody(changePasswordSchema)
  async changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword, meta);
    return { ok: true };
  }
}

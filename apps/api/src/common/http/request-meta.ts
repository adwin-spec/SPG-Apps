import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestMeta { ip: string | null; userAgent: string | null }
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest();
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
});

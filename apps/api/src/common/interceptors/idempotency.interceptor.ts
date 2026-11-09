import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, from, of } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Idempotency-Key support (ADR D7). A replay with the same key + same body returns the stored response;
 * same key with a different body → 409. Applies to POST/PUT/PATCH when the header is present.
 * (Entity-level `client_id` uniqueness is the second line of defence.)
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key: string | undefined = req.headers['idempotency-key'];
    if (!key || !req.user || !['POST', 'PUT', 'PATCH'].includes(req.method)) return next.handle();
    if (key.length > 100) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_INVALID', message: 'Idempotency-Key too long' });
    const hash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    const path = String(req.originalUrl ?? req.url).split('?')[0].slice(0, 300);
    return from(this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: req.user.id, key } } })).pipe(
      mergeMap((existing) => {
        if (existing) {
          if (existing.requestHash !== hash || existing.path !== path) {
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key was used with a different request' });
          }
          if (existing.responseStatus != null) {
            res.status(existing.responseStatus);
            res.setHeader('Idempotent-Replay', 'true');
            return of(existing.responseBody);
          }
          throw new ConflictException({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'Request with this key is still being processed' });
        }
        return from(this.prisma.idempotencyKey.create({ data: { userId: req.user.id, key, method: req.method, path, requestHash: hash } })).pipe(
          mergeMap(() => next.handle()),
          tap({
            next: (body) => { void this.prisma.idempotencyKey.update({ where: { userId_key: { userId: req.user.id, key } }, data: { responseStatus: res.statusCode, responseBody: body as object } }).catch(() => undefined); },
            error: () => { void this.prisma.idempotencyKey.delete({ where: { userId_key: { userId: req.user.id, key } } }).catch(() => undefined); },
          }),
        );
      }),
    );
  }
}

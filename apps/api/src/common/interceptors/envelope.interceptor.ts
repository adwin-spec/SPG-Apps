import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Paginated } from '../http/paginated';

/** Uniform response envelope: { data, meta? }. */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((r) => {
      if (r instanceof StreamableFile) return r;
      if (r instanceof Paginated) return { data: r.items, meta: r.meta };
      return { data: r ?? null };
    }));
  }
}

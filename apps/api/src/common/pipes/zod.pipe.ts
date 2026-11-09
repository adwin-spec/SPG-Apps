import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Validates & coerces request payloads with the shared Zod schemas (ADR D2). */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown, metadata?: ArgumentMetadata): z.infer<T> {
    // In query strings an empty parameter (e.g. `areaId=`) means "no filter", not an invalid value.
    if (metadata?.type === 'query' && value && typeof value === 'object') {
      value = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== ''));
    }
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      });
    }
    return r.data;
  }
}

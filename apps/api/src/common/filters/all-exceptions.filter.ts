import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { ThrottlerException } from '@nestjs/throttler';

/** Centralised error handling – never leaks stack traces or SQL to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exceptions');
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Unexpected server error';
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = 429; code = 'RATE_LIMITED'; message = 'Too many requests';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body) {
        const b = body as Record<string, unknown>;
        code = (b.code as string) ?? HttpStatus[status] ?? 'ERROR';
        message = (Array.isArray(b.message) ? b.message.join('; ') : (b.message as string)) ?? exception.message;
        details = b.details;
      } else { code = HttpStatus[status] ?? 'ERROR'; message = String(body); }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; code = 'UNIQUE_CONSTRAINT'; message = 'A record with the same unique value already exists'; details = exception.meta?.target; }
      else if (exception.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
      else if (exception.code === 'P2003') { status = 400; code = 'INVALID_REFERENCE'; message = 'Referenced record does not exist'; details = exception.meta?.field_name; }
      else { this.log.error(exception.message); }
    } else if (exception instanceof Error && /append-only|cannot be modified|check constraint/i.test(exception.message)) {
      // Database integrity triggers / constraints (ADR D9)
      status = 409; code = 'INTEGRITY_RULE'; message = exception.message.split('\n').pop()?.trim() ?? 'Integrity rule violated';
    } else if (exception instanceof Error) {
      this.log.error(`${req?.method} ${req?.url} → ${exception.message}`, exception.stack);
    }
    if (status >= 500 && !(exception instanceof Error)) this.log.error(String(exception));
    res.status(status).json({ statusCode: status, error: { code, message, ...(details !== undefined ? { details } : {}) } });
  }
}

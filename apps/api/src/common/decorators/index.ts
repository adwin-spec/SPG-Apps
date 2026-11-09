import { createParamDecorator, ExecutionContext, SetMetadata, UsePipes, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser, PermissionCode } from '@tanda/shared';

export const IS_PUBLIC = 'isPublic';
export const PERMS_KEY = 'permissions';

/** Endpoint does not require authentication (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** User must hold ALL listed permissions. Every non-public endpoint must declare at least one. */
export const RequirePermissions = (...perms: PermissionCode[]) => SetMetadata(PERMS_KEY, perms);
/** User must hold ANY of the listed permissions. */
export const PERMS_ANY_KEY = 'permissionsAny';
export const RequireAnyPermission = (...perms: PermissionCode[]) => SetMetadata(PERMS_ANY_KEY, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

function jsonSchema(schema: z.ZodType) {
  try { return z.toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any', io: 'input' }) as Record<string, unknown>; } catch { return { type: 'object' }; }
}
/** Documents a Zod body schema in Swagger. Validation happens via ZodPipe on the @Body param. */
export const ApiZodBody = (schema: z.ZodType) => applyDecorators(ApiBody({ schema: jsonSchema(schema) as never }));
export const ApiZodQuery = (schema: z.ZodObject) =>
  applyDecorators(...Object.keys(schema.shape).map((name) => ApiQuery({ name, required: false })));
export { UsePipes };

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, passwordSchema, userCreateSchema, userUpdateSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { UsersService, userListQuery } from './users.service';

const resetSchema = z.object({ password: passwordSchema });

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query(new ZodPipe(userListQuery)) q: z.infer<typeof userListQuery>) { return this.users.list(q); }

  @Get(':id') @RequirePermissions(PERMISSIONS.USERS_READ)
  get(@Param('id', ParseUUIDPipe) id: string) { return this.users.get(id); }

  @Post() @RequirePermissions(PERMISSIONS.USERS_MANAGE) @ApiZodBody(userCreateSchema)
  create(@Body(new ZodPipe(userCreateSchema)) body: z.infer<typeof userCreateSchema>, @CurrentUser() u: AuthUser) { return this.users.create(body, u); }

  @Patch(':id') @RequirePermissions(PERMISSIONS.USERS_MANAGE) @ApiZodBody(userUpdateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(userUpdateSchema)) body: z.infer<typeof userUpdateSchema>, @CurrentUser() u: AuthUser) { return this.users.update(id, body, u); }

  @Post(':id/reset-password') @RequirePermissions(PERMISSIONS.USERS_MANAGE) @ApiZodBody(resetSchema)
  async reset(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(resetSchema)) body: z.infer<typeof resetSchema>, @CurrentUser() u: AuthUser) {
    await this.users.resetPassword(id, body.password, u); return { ok: true };
  }
}

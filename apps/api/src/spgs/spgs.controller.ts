import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, spgAssignSchema, spgCreateSchema, spgUpdateSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { SpgsService, spgListQuery } from './spgs.service';

@ApiTags('SPG')
@ApiBearerAuth()
@Controller('spgs')
export class SpgsController {
  constructor(private readonly spgs: SpgsService) {}

  @Get() @RequirePermissions(PERMISSIONS.SPG_READ)
  list(@Query(new ZodPipe(spgListQuery)) q: z.infer<typeof spgListQuery>, @CurrentUser() u: AuthUser) { return this.spgs.list(q, u); }

  @Get(':id') @RequirePermissions(PERMISSIONS.SPG_READ)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.spgs.get(id, u); }

  @Post() @RequirePermissions(PERMISSIONS.SPG_MANAGE) @ApiZodBody(spgCreateSchema)
  create(@Body(new ZodPipe(spgCreateSchema)) b: z.infer<typeof spgCreateSchema>, @CurrentUser() u: AuthUser) { return this.spgs.create(b, u); }

  @Patch(':id') @RequirePermissions(PERMISSIONS.SPG_MANAGE) @ApiZodBody(spgUpdateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(spgUpdateSchema)) b: z.infer<typeof spgUpdateSchema>, @CurrentUser() u: AuthUser) { return this.spgs.update(id, b, u); }

  @Post(':id/assignments') @RequirePermissions(PERMISSIONS.SPG_MANAGE) @ApiZodBody(spgAssignSchema)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(spgAssignSchema)) b: z.infer<typeof spgAssignSchema>, @CurrentUser() u: AuthUser) { return this.spgs.assign(id, b, u); }
}

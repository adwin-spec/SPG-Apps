import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, outletCreateSchema, outletUpdateSchema, retailerLinkSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { OutletsService, duplicateQuery, outletListQuery } from './outlets.service';

@ApiTags('Outlets')
@ApiBearerAuth()
@Controller('outlets')
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  @Get() @RequirePermissions(PERMISSIONS.OUTLET_READ)
  list(@Query(new ZodPipe(outletListQuery)) q: z.infer<typeof outletListQuery>, @CurrentUser() u: AuthUser) { return this.outlets.list(q, u); }

  @Get('duplicates') @RequirePermissions(PERMISSIONS.OUTLET_READ)
  duplicates(@Query(new ZodPipe(duplicateQuery)) q: z.infer<typeof duplicateQuery>) { return this.outlets.findDuplicates(q.name, q.districtId, q.channel); }

  @Get(':id') @RequirePermissions(PERMISSIONS.OUTLET_READ)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.outlets.get(id, u); }

  @Post() @RequireAnyPermission(PERMISSIONS.OUTLET_MANAGE, PERMISSIONS.OUTLET_CREATE_FIELD) @ApiZodBody(outletCreateSchema)
  create(@Body(new ZodPipe(outletCreateSchema)) b: z.infer<typeof outletCreateSchema>, @CurrentUser() u: AuthUser) { return this.outlets.create(b, u); }

  @Patch(':id') @RequirePermissions(PERMISSIONS.OUTLET_MANAGE) @ApiZodBody(outletUpdateSchema)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(outletUpdateSchema)) b: z.infer<typeof outletUpdateSchema>, @CurrentUser() u: AuthUser) { return this.outlets.update(id, b, u); }

  @Post(':id/wholesalers') @RequirePermissions(PERMISSIONS.OUTLET_MANAGE) @ApiZodBody(retailerLinkSchema)
  link(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(retailerLinkSchema)) b: z.infer<typeof retailerLinkSchema>, @CurrentUser() u: AuthUser) { return this.outlets.link(id, b, u); }

  @Delete(':id/wholesalers/:linkId') @RequirePermissions(PERMISSIONS.OUTLET_MANAGE)
  unlink(@Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string, @CurrentUser() u: AuthUser) { return this.outlets.unlink(id, linkId, u); }
}
